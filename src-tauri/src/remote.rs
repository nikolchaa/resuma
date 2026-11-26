use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response};
use serde::Serialize;
use serde_json::{json, Value};

use crate::secrets::get_api_key;

const GENERATION_TIMEOUT_SECS: u64 = 600;
const LISTING_TIMEOUT_SECS: u64 = 20;
/// Room for the answer and, on models that think first (current Claude,
/// OpenAI reasoning and Gemini models), the thinking that counts toward it.
const DEFAULT_MAX_TOKENS: u64 = 16_000;
/// The Claude API version. From 2026-10-21 on, `temperature`, `top_p` and
/// `top_k` are rejected, so no Anthropic request sends them.
const ANTHROPIC_VERSION: &str = "2026-10-21";
/// Shown when a model used its whole output limit before answering.
const OUT_OF_TOKENS: &str =
    "The model used up its output limit before it answered. Raise Max Tokens in Settings → AI Settings.";

/// Wire format of a provider. Several providers share one flavor:
/// DeepSeek, Kimi and LM Studio all speak the OpenAI chat-completions API.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ApiFlavor {
    OpenAi,
    Anthropic,
    Gemini,
    Ollama,
}

impl ApiFlavor {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "openai" => Ok(ApiFlavor::OpenAi),
            "anthropic" => Ok(ApiFlavor::Anthropic),
            "gemini" => Ok(ApiFlavor::Gemini),
            "ollama" => Ok(ApiFlavor::Ollama),
            other => Err(format!("Unknown API flavor: {other}")),
        }
    }
}

#[derive(Serialize)]
pub struct RemoteModel {
    pub id: String,
    pub label: String,
}

struct RemoteConfig {
    provider: String,
    api: ApiFlavor,
    base_url: String,
    model: String,
    temperature: f64,
    max_tokens: u64,
}

impl RemoteConfig {
    /// `llm_settings` is the `llm` section of the settings store, which carries
    /// the provider descriptor the frontend resolved from `providers.json`.
    fn from_settings(llm_settings: &Value) -> Result<Self, String> {
        let remote = &llm_settings["remote"];

        let provider = llm_settings["provider"]
            .as_str()
            .ok_or("Missing provider")?
            .to_string();

        let api = ApiFlavor::parse(remote["api"].as_str().ok_or("Missing provider API flavor")?)?;

        let base_url = remote["baseUrl"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .trim_end_matches('/')
            .to_string();

        if base_url.is_empty() {
            return Err("Missing base URL for the selected provider".to_string());
        }

        let model = remote["model"].as_str().unwrap_or_default().trim().to_string();

        if model.is_empty() {
            return Err("No model selected for the selected provider".to_string());
        }

        let max_tokens = remote["maxTokens"]
            .as_u64()
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_MAX_TOKENS);

        Ok(RemoteConfig {
            provider,
            api,
            base_url,
            model,
            temperature: remote["temperature"].as_f64().unwrap_or(0.7),
            max_tokens,
        })
    }
}

fn client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Applies the provider's authentication header. Local servers are allowed to
/// run without a key, so a missing key is only fatal for cloud providers.
fn authenticate(
    request: RequestBuilder,
    api: ApiFlavor,
    key: Option<&String>,
) -> RequestBuilder {
    let Some(key) = key else {
        return request;
    };

    match api {
        ApiFlavor::OpenAi => request.header("Authorization", format!("Bearer {key}")),
        ApiFlavor::Anthropic => request
            .header("x-api-key", key.as_str())
            .header("anthropic-version", ANTHROPIC_VERSION),
        ApiFlavor::Gemini => request.header("x-goog-api-key", key.as_str()),
        ApiFlavor::Ollama => request.header("Authorization", format!("Bearer {key}")),
    }
}

async fn read_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Request failed ({status}): {}", describe_error(&body)));
    }

    serde_json::from_str::<Value>(&body).map_err(|e| format!("Invalid JSON response: {e}"))
}

/// Providers wrap their message in different envelopes; fall back to a trimmed
/// snippet of the raw body so the user still sees something actionable.
fn describe_error(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        let message = value["error"]["message"]
            .as_str()
            .or_else(|| value["error"].as_str())
            .or_else(|| value["message"].as_str())
            .or_else(|| value["detail"].as_str());

        if let Some(message) = message {
            return message.to_string();
        }
    }

    let trimmed = body.trim();
    if trimmed.is_empty() {
        "No response body".to_string()
    } else {
        trimmed.chars().take(500).collect()
    }
}

pub async fn call_remote(prompt: String, llm_settings: Value) -> Result<String, String> {
    let config = RemoteConfig::from_settings(&llm_settings)?;
    let key = get_api_key(&config.provider)?;

    if key.is_none() && matches!(config.api, ApiFlavor::Anthropic | ApiFlavor::Gemini) {
        return Err(format!("No API key stored for {}", config.provider));
    }

    let client = client(GENERATION_TIMEOUT_SECS)?;

    let raw = match config.api {
        ApiFlavor::OpenAi => call_openai(&client, &config, key.as_ref(), &prompt).await?,
        ApiFlavor::Anthropic => call_anthropic(&client, &config, key.as_ref(), &prompt).await?,
        ApiFlavor::Gemini => call_gemini(&client, &config, key.as_ref(), &prompt).await?,
        ApiFlavor::Ollama => call_ollama(&client, &config, key.as_ref(), &prompt).await?,
    };

    let cleaned = strip_reasoning(&raw);

    if cleaned.is_empty() {
        Err("The model returned an empty response".to_string())
    } else {
        Ok(cleaned)
    }
}

/// What an OpenAI-style endpoint turned out to need, learned from a rejected
/// request: OpenAI's own API wants `max_completion_tokens` (`max_tokens` is
/// deprecated there, and its reasoning models reject it), many compatible
/// servers only know `max_tokens`, and reasoning models reject any
/// temperature but the default.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct OpenAiQuirks {
    completion_tokens: bool,
    no_temperature: bool,
}

/// Quirks learned this session, per endpoint and model, so later requests
/// don't pay for a rejected first try again.
fn learned_quirks() -> &'static Mutex<HashMap<String, OpenAiQuirks>> {
    static LEARNED: OnceLock<Mutex<HashMap<String, OpenAiQuirks>>> = OnceLock::new();
    LEARNED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn quirks_key(config: &RemoteConfig) -> String {
    format!("{}|{}", config.base_url, config.model)
}

fn starting_quirks(config: &RemoteConfig) -> OpenAiQuirks {
    let learned = learned_quirks().lock().ok().and_then(|map| map.get(&quirks_key(config)).copied());
    learned.unwrap_or(OpenAiQuirks {
        completion_tokens: config.provider == "openai",
        no_temperature: false,
    })
}

fn openai_body(config: &RemoteConfig, prompt: &str, quirks: OpenAiQuirks) -> Value {
    let mut body = json!({
        "model": config.model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false,
    });
    let limit_field = if quirks.completion_tokens { "max_completion_tokens" } else { "max_tokens" };
    body[limit_field] = json!(config.max_tokens);
    if !quirks.no_temperature {
        body["temperature"] = json!(config.temperature);
    }
    body
}

/// The quirks a 400 error message points at, or None if it's about
/// something else. The message is judged against the field that was sent:
/// OpenAI's "'max_tokens' is not supported … Use 'max_completion_tokens'
/// instead" names both.
fn quirks_after_rejection(quirks: OpenAiQuirks, message: &str) -> Option<OpenAiQuirks> {
    let mut next = quirks;
    if quirks.completion_tokens {
        if message.contains("max_completion_tokens") {
            next.completion_tokens = false;
        }
    } else if message.contains("max_tokens") {
        next.completion_tokens = true;
    }
    if message.contains("temperature") {
        next.no_temperature = true;
    }
    (next != quirks).then_some(next)
}

async fn call_openai(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", config.base_url);
    let mut quirks = starting_quirks(config);

    let mut response = authenticate(client.post(&url), config.api, key)
        .json(&openai_body(config, prompt, quirks))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    // One retry with what the rejection asked for, remembered for next time.
    if response.status() == reqwest::StatusCode::BAD_REQUEST {
        let message = response
            .text()
            .await
            .map(|text| describe_error(&text))
            .unwrap_or_default();

        let Some(next) = quirks_after_rejection(quirks, &message) else {
            return Err(format!("Request failed (400 Bad Request): {message}"));
        };
        quirks = next;

        response = authenticate(client.post(&url), config.api, key)
            .json(&openai_body(config, prompt, quirks))
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
        if response.status().is_success() {
            if let Ok(mut map) = learned_quirks().lock() {
                map.insert(quirks_key(config), quirks);
            }
        }
    }

    openai_text(&read_json(response).await?)
}

/// The answer from a chat-completions reply; a refusal or an answer cut off
/// by the output limit become errors that say so.
fn openai_text(json: &Value) -> Result<String, String> {
    let choice = &json["choices"][0];
    let message = &choice["message"];

    if let Some(refusal) = message["refusal"].as_str().filter(|r| !r.trim().is_empty()) {
        return Err(format!("The model declined this request: {refusal}"));
    }

    let text = message["content"]
        .as_str()
        .map(|text| text.to_string())
        .or_else(|| collect_text_parts(&message["content"]))
        .or_else(|| choice["text"].as_str().map(|t| t.to_string()))
        .ok_or("Unexpected response shape from the provider")?;

    if text.trim().is_empty() && choice["finish_reason"].as_str() == Some("length") {
        return Err(OUT_OF_TOKENS.to_string());
    }
    Ok(text)
}

/// No sampling parameters: Claude 4.7 and later accept only the defaults,
/// and API version 2026-10-21 removes them for every model.
fn anthropic_body(config: &RemoteConfig, prompt: &str) -> Value {
    json!({
        "model": config.model,
        "max_tokens": config.max_tokens,
        "messages": [{ "role": "user", "content": prompt }],
    })
}

async fn call_anthropic(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/messages", config.base_url);

    let response = authenticate(client.post(&url), config.api, key)
        .json(&anthropic_body(config, prompt))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    anthropic_text(&read_json(response).await?)
}

/// The text blocks of a Messages reply (thinking blocks are left out). A
/// refusal, or an answer cut off by the output limit, become errors.
fn anthropic_text(json: &Value) -> Result<String, String> {
    let blocks = json["content"].as_array().ok_or("Unexpected response shape from the provider")?;
    let text = blocks
        .iter()
        .filter(|block| block["type"].as_str() == Some("text"))
        .filter_map(|block| block["text"].as_str())
        .collect::<Vec<_>>()
        .join("");

    match json["stop_reason"].as_str() {
        Some("refusal") => {
            let why = json["stop_details"]["explanation"].as_str().unwrap_or("").trim();
            Err(if why.is_empty() {
                "The model declined this request.".to_string()
            } else {
                format!("The model declined this request: {why}")
            })
        }
        Some("max_tokens") if text.trim().is_empty() => Err(OUT_OF_TOKENS.to_string()),
        _ => Ok(text),
    }
}

async fn call_gemini(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/models/{}:generateContent",
        config.base_url, config.model
    );

    let body = json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": config.temperature,
            "maxOutputTokens": config.max_tokens,
        },
    });

    let response = authenticate(client.post(&url), config.api, key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    gemini_text(&read_json(response).await?)
}

/// The answer parts of a generateContent reply (thought summaries are left
/// out). A blocked prompt or answer, or one cut off by the output limit,
/// become errors that say so.
fn gemini_text(json: &Value) -> Result<String, String> {
    let candidate = &json["candidates"][0];
    let Some(parts) = candidate["content"]["parts"].as_array() else {
        if let Some(reason) = json["promptFeedback"]["blockReason"].as_str() {
            return Err(format!("The provider blocked this request: {reason}"));
        }
        return match candidate["finishReason"].as_str() {
            Some("MAX_TOKENS") => Err(OUT_OF_TOKENS.to_string()),
            Some(reason) if reason != "STOP" => Err(format!("The provider stopped the answer: {reason}")),
            _ => Err("Unexpected response shape from the provider".to_string()),
        };
    };
    let text = parts
        .iter()
        .filter(|part| part["thought"].as_bool() != Some(true))
        .filter_map(|part| part["text"].as_str())
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        match candidate["finishReason"].as_str() {
            Some("MAX_TOKENS") => return Err(OUT_OF_TOKENS.to_string()),
            Some(reason) if reason != "STOP" => return Err(format!("The provider stopped the answer: {reason}")),
            _ => {}
        }
    }
    Ok(text)
}

async fn call_ollama(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/api/chat", config.base_url);

    let body = json!({
        "model": config.model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false,
        "options": {
            "temperature": config.temperature,
            "num_predict": config.max_tokens,
        },
    });

    let response = authenticate(client.post(&url), config.api, key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    ollama_text(&read_json(response).await?)
}

fn ollama_text(json: &Value) -> Result<String, String> {
    let text = json["message"]["content"]
        .as_str()
        .ok_or("Unexpected response shape from the provider")?;
    if text.trim().is_empty() && json["done_reason"].as_str() == Some("length") {
        return Err(OUT_OF_TOKENS.to_string());
    }
    Ok(text.to_string())
}

/// OpenAI's array-form message content: `[{ "type": "text", "text": "..." }]`.
fn collect_text_parts(value: &Value) -> Option<String> {
    let parts = value.as_array()?;

    let text = parts
        .iter()
        .filter_map(|part| part["text"].as_str())
        .collect::<Vec<_>>()
        .join("");

    Some(text)
}

/// Reasoning models emit their scratchpad inline. Local llama.cpp output is
/// handled separately in `llm.rs`, which has to deal with CLI framing too.
pub fn strip_reasoning(text: &str) -> String {
    let mut result = text.to_string();

    while let (Some(start), Some(end)) = (result.find("<think>"), result.find("</think>")) {
        if start >= end {
            break;
        }
        result.replace_range(start..end + "</think>".len(), "");
    }

    // Some providers drop the opening tag and only close the block.
    if let Some(end) = result.find("</think>") {
        result = result[end + "</think>".len()..].to_string();
    }

    result.trim().to_string()
}

#[tauri::command]
pub async fn list_remote_models(
    provider: String,
    api: String,
    base_url: String,
) -> Result<Vec<RemoteModel>, String> {
    let api = ApiFlavor::parse(&api)?;
    let base_url = base_url.trim().trim_end_matches('/').to_string();

    if base_url.is_empty() {
        return Err("Missing base URL for the selected provider".to_string());
    }

    let key = get_api_key(&provider)?;

    if key.is_none() && matches!(api, ApiFlavor::Anthropic | ApiFlavor::Gemini) {
        return Err(format!("No API key stored for {provider}"));
    }

    let client = client(LISTING_TIMEOUT_SECS)?;

    let url = match api {
        ApiFlavor::OpenAi => format!("{base_url}/models"),
        // Twenty models a page by default; there are more than that now.
        ApiFlavor::Anthropic => format!("{base_url}/models?limit=1000"),
        ApiFlavor::Gemini => format!("{base_url}/models?pageSize=200"),
        ApiFlavor::Ollama => format!("{base_url}/api/tags"),
    };

    let response = authenticate(client.get(&url), api, key.as_ref())
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let json = read_json(response).await?;

    let mut models = match api {
        ApiFlavor::OpenAi => parse_openai_models(&json),
        ApiFlavor::Anthropic => parse_anthropic_models(&json),
        ApiFlavor::Gemini => parse_gemini_models(&json),
        ApiFlavor::Ollama => parse_ollama_models(&json),
    };

    models.sort_by(|a, b| a.id.cmp(&b.id));
    models.dedup_by(|a, b| a.id == b.id);

    Ok(models)
}

fn parse_openai_models(json: &Value) -> Vec<RemoteModel> {
    json["data"]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry["id"].as_str())
                .map(|id| RemoteModel {
                    id: id.to_string(),
                    label: id.to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_anthropic_models(json: &Value) -> Vec<RemoteModel> {
    json["data"]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let id = entry["id"].as_str()?;
                    Some(RemoteModel {
                        id: id.to_string(),
                        label: entry["display_name"].as_str().unwrap_or(id).to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_gemini_models(json: &Value) -> Vec<RemoteModel> {
    json["models"]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter(|entry| {
                    entry["supportedGenerationMethods"]
                        .as_array()
                        .map(|methods| {
                            methods
                                .iter()
                                .any(|method| method.as_str() == Some("generateContent"))
                        })
                        .unwrap_or(true)
                })
                .filter_map(|entry| {
                    let name = entry["name"].as_str()?;
                    let id = name.strip_prefix("models/").unwrap_or(name);
                    Some(RemoteModel {
                        id: id.to_string(),
                        label: entry["displayName"].as_str().unwrap_or(id).to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_ollama_models(json: &Value) -> Vec<RemoteModel> {
    json["models"]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let id = entry["name"].as_str().or_else(|| entry["model"].as_str())?;
                    Some(RemoteModel {
                        id: id.to_string(),
                        label: id.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(provider: &str, api: ApiFlavor, model: &str) -> RemoteConfig {
        RemoteConfig {
            provider: provider.into(),
            api,
            base_url: "https://example.test/v1".into(),
            model: model.into(),
            temperature: 0.7,
            max_tokens: DEFAULT_MAX_TOKENS,
        }
    }

    #[test]
    fn openai_gets_max_completion_tokens_and_compatible_servers_max_tokens() {
        let openai = config("openai", ApiFlavor::OpenAi, "gpt-test");
        let body = openai_body(&openai, "hi", starting_quirks(&openai));
        assert_eq!(body["max_completion_tokens"], 16_000);
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["temperature"], 0.7);

        let deepseek = config("deepseek", ApiFlavor::OpenAi, "deepseek-test");
        let body = openai_body(&deepseek, "hi", starting_quirks(&deepseek));
        assert_eq!(body["max_tokens"], 16_000);
        assert!(body.get("max_completion_tokens").is_none());
    }

    #[test]
    fn rejections_switch_only_what_they_name() {
        let sent_max_tokens = OpenAiQuirks { completion_tokens: false, no_temperature: false };
        // OpenAI's wording names both fields.
        let openai = "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
        assert_eq!(
            quirks_after_rejection(sent_max_tokens, openai),
            Some(OpenAiQuirks { completion_tokens: true, no_temperature: false })
        );
        // A compatible server that doesn't know the newer field.
        let sent_completion = OpenAiQuirks { completion_tokens: true, no_temperature: false };
        assert_eq!(
            quirks_after_rejection(sent_completion, "Unrecognized request argument supplied: max_completion_tokens"),
            Some(OpenAiQuirks { completion_tokens: false, no_temperature: false })
        );
        let temperature = "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.";
        assert_eq!(
            quirks_after_rejection(sent_completion, temperature),
            Some(OpenAiQuirks { completion_tokens: true, no_temperature: true })
        );
        assert_eq!(quirks_after_rejection(sent_completion, "Invalid model name"), None);
        let body = openai_body(&config("openai", ApiFlavor::OpenAi, "m"), "hi", OpenAiQuirks { completion_tokens: true, no_temperature: true });
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn anthropic_requests_send_no_sampling_parameters() {
        let body = anthropic_body(&config("anthropic", ApiFlavor::Anthropic, "claude-opus-5-5"), "hi");
        assert!(body.get("temperature").is_none());
        assert!(body.get("top_p").is_none() && body.get("top_k").is_none());
        assert_eq!(body["max_tokens"], 16_000);
    }

    #[test]
    fn reads_answers_and_explains_refusals_and_cut_off_answers() {
        // Claude: thinking blocks are skipped.
        let ok = json!({"content": [{"type": "thinking", "thinking": ""}, {"type": "text", "text": "Hello"}], "stop_reason": "end_turn"});
        assert_eq!(anthropic_text(&ok).unwrap(), "Hello");
        let refused = json!({"content": [], "stop_reason": "refusal", "stop_details": {"type": "refusal", "category": null, "explanation": "Not allowed."}});
        assert!(anthropic_text(&refused).unwrap_err().contains("Not allowed."));
        let cut = json!({"content": [{"type": "thinking", "thinking": ""}], "stop_reason": "max_tokens"});
        assert_eq!(anthropic_text(&cut).unwrap_err(), OUT_OF_TOKENS);

        // OpenAI-style.
        assert_eq!(openai_text(&json!({"choices": [{"message": {"content": "Hi"}, "finish_reason": "stop"}]})).unwrap(), "Hi");
        let refusal = json!({"choices": [{"message": {"content": null, "refusal": "I can't help with that."}}]});
        assert!(openai_text(&refusal).unwrap_err().contains("can't help"));
        let length = json!({"choices": [{"message": {"content": ""}, "finish_reason": "length"}]});
        assert_eq!(openai_text(&length).unwrap_err(), OUT_OF_TOKENS);

        // Gemini: thought summaries are skipped.
        let gemini = json!({"candidates": [{"content": {"parts": [{"text": "plan", "thought": true}, {"text": "Answer"}]}, "finishReason": "STOP"}]});
        assert_eq!(gemini_text(&gemini).unwrap(), "Answer");
        let no_parts = json!({"candidates": [{"content": {"role": "model"}, "finishReason": "MAX_TOKENS"}]});
        assert_eq!(gemini_text(&no_parts).unwrap_err(), OUT_OF_TOKENS);
        let blocked = json!({"promptFeedback": {"blockReason": "SAFETY"}});
        assert!(gemini_text(&blocked).unwrap_err().contains("SAFETY"));

        // Ollama.
        assert_eq!(ollama_text(&json!({"message": {"content": "Yo"}, "done_reason": "stop"})).unwrap(), "Yo");
        assert_eq!(ollama_text(&json!({"message": {"content": ""}, "done_reason": "length"})).unwrap_err(), OUT_OF_TOKENS);
    }
}
