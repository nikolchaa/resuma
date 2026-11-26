//! The job-matching model: a small reranker that scores how well each
//! resume entry fits a job ad. It runs in `llama-server` from the user's
//! llama.cpp runtime, bound to 127.0.0.1 only, started when tailoring needs
//! it and stopped right after, so it never holds memory the chat model
//! needs. Only current llama.cpp builds can serve rerankers.

use std::io::Read;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::llm::{self, LlamaBuild};

/// Context per request. Each (job ad, entry) pair must fit in one batch.
const CONTEXT: u32 = 8192;
/// How long the server may take to load the model.
const START_TIMEOUT: Duration = Duration::from_secs(90);
/// Job ads are cut to this many characters: the pair must fit the batch.
const MAX_QUERY_CHARS: usize = 12_000;
const MAX_DOCUMENT_CHARS: usize = 4_000;

struct Server {
    child: Child,
    port: u16,
    runtime: String,
    model: String,
    /// The last lines llama-server wrote, for error messages.
    log: Arc<Mutex<String>>,
}

fn server() -> &'static Mutex<Option<Server>> {
    static SERVER: OnceLock<Mutex<Option<Server>>> = OnceLock::new();
    SERVER.get_or_init(|| Mutex::new(None))
}

fn lock() -> std::sync::MutexGuard<'static, Option<Server>> {
    server().lock().unwrap_or_else(|p| p.into_inner())
}

/// Stops the server, if one runs.
pub fn stop() {
    if let Some(mut s) = lock().take() {
        let _ = s.child.kill();
        let _ = s.child.wait();
    }
}

fn exe(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// `llama-server` next to the runtime's one-shot binary; only current builds.
fn server_binary(runtime_dir: &Path) -> Result<PathBuf, String> {
    let (completion, build) =
        llm::find_runtime_binary(runtime_dir).ok_or_else(|| format!("Runtime not found in {:?}", runtime_dir))?;
    if build != LlamaBuild::Current {
        return Err("This llama.cpp runtime is too old for job matching. Update it in Settings → AI Settings.".into());
    }
    let path = completion.with_file_name(exe("llama-server"));
    if path.is_file() {
        Ok(path)
    } else {
        Err("This llama.cpp runtime has no llama-server.".into())
    }
}

/// `<app data>/rerankers`; tests may point elsewhere with `RESUMA_TEST_RERANKERS_DIR`.
fn rerankers_root(app_data: &Path) -> PathBuf {
    #[cfg(test)]
    if let Ok(dir) = std::env::var("RESUMA_TEST_RERANKERS_DIR") {
        return PathBuf::from(dir);
    }
    app_data.join("rerankers")
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("No free local port: {e}"))
}

fn tail(log: &Arc<Mutex<String>>) -> String {
    let text = log.lock().map(|l| l.clone()).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(5)..].join("\n")
}

/// Starts the server for this runtime and model, or reuses the one running.
async fn ensure(runtime: &str, model: &str) -> Result<u16, String> {
    {
        let mut guard = lock();
        if let Some(s) = guard.as_mut() {
            let alive = matches!(s.child.try_wait(), Ok(None));
            if alive && s.runtime == runtime && s.model == model {
                return Ok(s.port);
            }
        }
    }
    stop();

    let app_data = llm::get_app_data_path()?;
    let binary = server_binary(&llm::runtimes_root(&app_data).join(runtime))?;
    let model_dir = rerankers_root(&app_data).join(model);
    let model_path =
        llm::find_gguf_file(&model_dir).ok_or_else(|| "The job matching model isn't downloaded.".to_string())?;
    let port = free_port()?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&binary) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&binary, perms);
        }
    }

    let mut child = llm::llama_command(&binary)
        .args([
            "--model",
            &model_path.to_string_lossy(),
            "--reranking",
            "--pooling",
            "rank",
            "--embedding",
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--ctx-size",
            &CONTEXT.to_string(),
            "--batch-size",
            &CONTEXT.to_string(),
            "--ubatch-size",
            &CONTEXT.to_string(),
            "--parallel",
            "1",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Couldn't start the job matching model: {e}"))?;

    // Keep the end of the server's log for error messages.
    let log = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let log = log.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = stderr.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if let Ok(mut l) = log.lock() {
                    l.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if l.len() > 8192 {
                        let cut = l.len() - 4096;
                        let cut = (cut..l.len()).find(|&i| l.is_char_boundary(i)).unwrap_or(l.len());
                        l.drain(..cut);
                    }
                }
            }
        });
    }

    *lock() = Some(Server { child, port, runtime: runtime.to_string(), model: model.to_string(), log: log.clone() });

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let started = Instant::now();
    loop {
        {
            let mut guard = lock();
            let Some(s) = guard.as_mut() else {
                return Err(llm::CANCELLED.into());
            };
            if let Ok(Some(status)) = s.child.try_wait() {
                let message = tail(&s.log);
                *guard = None;
                return Err(format!("The job matching model stopped ({status}): {message}"));
            }
        }
        if let Ok(r) = http.get(format!("http://127.0.0.1:{port}/health")).send().await {
            if r.status().is_success() {
                return Ok(port);
            }
        }
        if started.elapsed() > START_TIMEOUT {
            stop();
            return Err(format!("The job matching model took too long to start: {}", tail(&log)));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

fn clip(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Scores each document against the query: higher fits better. Scores are
/// relevance probabilities but not calibrated, so compare them with a
/// cut-off measured for this model.
#[tauri::command]
pub async fn rerank(runtime: String, model: String, query: String, documents: Vec<String>) -> Result<Vec<f64>, String> {
    if documents.is_empty() {
        return Ok(vec![]);
    }
    let port = ensure(&runtime, &model).await?;
    let body = json!({
        "query": clip(&query, MAX_QUERY_CHARS),
        "documents": documents.iter().map(|d| clip(d, MAX_DOCUMENT_CHARS)).collect::<Vec<_>>(),
        "top_n": documents.len(),
    });
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let response = http
        .post(format!("http://127.0.0.1:{port}/v1/rerank"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if lock().is_none() {
                llm::CANCELLED.to_string()
            } else {
                format!("Job matching failed: {e}")
            }
        })?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Job matching failed ({status}): {}", clip(&text, 300)));
    }
    let value: Value = response.json().await.map_err(|e| format!("Job matching returned no scores: {e}"))?;
    let mut scores = vec![f64::NAN; documents.len()];
    for r in value["results"].as_array().into_iter().flatten() {
        if let (Some(i), Some(score)) = (r["index"].as_u64(), r["relevance_score"].as_f64()) {
            if let Some(slot) = scores.get_mut(i as usize) {
                *slot = score;
            }
        }
    }
    if scores.iter().any(|s| s.is_nan()) {
        return Err("Job matching returned too few scores.".into());
    }
    Ok(scores)
}

/// Stops the job matching model, e.g. when scoring is done or was stopped.
#[tauri::command]
pub fn reranker_stop() {
    stop();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: scores real entries with an installed runtime and the job
    /// matching model, the way tailoring does, against a full-length ad.
    /// Checks that it runs, not what it scores. Run with:
    /// `RESUMA_TEST_RUNTIME=llama-cpu-win RESUMA_TEST_RERANKERS_DIR=<folder>
    /// RESUMA_TEST_RERANKER=<model folder in it> cargo test real_rerank -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_rerank() {
        let runtime = std::env::var("RESUMA_TEST_RUNTIME").expect("RESUMA_TEST_RUNTIME");
        let model = std::env::var("RESUMA_TEST_RERANKER").expect("RESUMA_TEST_RERANKER");
        let job = "Backend Developer (Python)\nLedgerly · Remote within EU · Full-time\n\nAbout us: Ledgerly builds invoicing and payment software for 40,000 small businesses across Europe. Our platform team of 12 engineers owns the APIs that every invoice, payment and bank sync goes through.\n\nWhat you'll do:\n- Design, build and maintain REST APIs in Python using Django and FastAPI\n- Model data in PostgreSQL and write migrations that run safely on large tables\n- Write unit and integration tests and keep our CI pipeline green\n- Deploy services with Docker to AWS (ECS, RDS, S3) and monitor them with Grafana\n- Review pull requests and pair with other engineers\n- Take part in a light on-call rotation (one week in eight)\n\nWhat we're looking for:\n- 2+ years of professional experience with Python\n- Solid SQL and relational database design\n- Comfort with Git, Linux and the command line\n- Clear written communication in English\n\nNice to have:\n- Redis or another cache, Celery or other task queues\n- Kubernetes or Terraform\n- Experience with payments, accounting or banking APIs\n\nWe offer: a fully remote team, 30 days of paid leave, a learning budget of €1,500 a year, and a new laptop of your choice.";
        let entries: Vec<String> = vec![
            "Experience: Backend Developer at Nordlab (2022 – Present). Built REST APIs with Django and PostgreSQL; moved deployments to Docker on AWS. Cut API response times by 40%. Reviewed pull requests for a team of 5.".to_string(),
            "Experience: Barista at Kafeterija (2019 – 2021). Prepared coffee and served customers in a busy cafe. Trained 3 new staff members. Handled the cash register and daily closing.".to_string(),
            "Education: BSc Computer Science, University of Belgrade (2018 – 2022).".to_string(),
            "Experience: Social Media Intern at Studio Eta (2020). Ran the studio's Instagram account and wrote weekly posts. Grew followers from 1,200 to 4,000 in six months. Designed post graphics in Canva.".to_string(),
        ];
        let started = std::time::Instant::now();
        let scores = tauri::async_runtime::block_on(rerank(runtime.clone(), model.clone(), job.to_string(), entries.clone()));
        stop();
        let scores = scores.expect("scoring failed");
        eprintln!("scored {} entries in {:?}: {:?}", entries.len(), started.elapsed(), scores);
        // A smoke test: the server starts, answers, and gives one usable
        // score per entry. What the scores are varies with the hardware and
        // the build, so it isn't checked here; they're printed above.
        assert_eq!(scores.len(), entries.len(), "one score per entry: {scores:?}");
        assert!(scores.iter().all(|s| s.is_finite()), "unusable scores: {scores:?}");
        // After stop(), the next request starts the server again.
        let again = tauri::async_runtime::block_on(rerank(runtime, model, job.to_string(), entries[..1].to_vec()));
        stop();
        assert_eq!(again.expect("second scoring failed").len(), 1);
    }
}
