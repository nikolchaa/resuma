use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response};
use serde::Serialize;
use serde_json::{json, Value};

use crate::secrets::get_api_key;

const GENERATION_TIMEOUT_SECS: u64 = 600;
const LISTING_TIMEOUT_SECS: u64 = 20;
const DEFAULT_MAX_TOKENS: u64 = 4096;

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
            .header("anthropic-version", "2023-06-01"),
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

async fn call_openai(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", config.base_url);

    let mut body = json!({
        "model": config.model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "stream": false,
    });

    let mut response = authenticate(client.post(&url), config.api, key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    // Reasoning models on OpenAI reject `max_tokens` and any temperature other
    // than the default, so retry once with those replaced/dropped.
    if response.status() == reqwest::StatusCode::BAD_REQUEST {
        let message = response
            .text()
            .await
            .map(|text| describe_error(&text))
            .unwrap_or_default();

        let mut retry = false;

        if message.contains("max_tokens") {
            body["max_completion_tokens"] = json!(config.max_tokens);
            if let Some(object) = body.as_object_mut() {
                object.remove("max_tokens");
            }
            retry = true;
        }

        if message.contains("temperature") {
            if let Some(object) = body.as_object_mut() {
                object.remove("temperature");
            }
            retry = true;
        }

        if !retry {
            return Err(format!("Request failed (400 Bad Request): {message}"));
        }

        response = authenticate(client.post(&url), config.api, key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
    }

    let json = read_json(response).await?;
    let message = &json["choices"][0]["message"];

    let text = message["content"]
        .as_str()
        .map(|text| text.to_string())
        .or_else(|| collect_text_parts(&message["content"]))
        .or_else(|| json["choices"][0]["text"].as_str().map(|t| t.to_string()))
        .ok_or("Unexpected response shape from the provider")?;

    Ok(text)
}

async fn call_anthropic(
    client: &Client,
    config: &RemoteConfig,
    key: Option<&String>,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/messages", config.base_url);

    let body = json!({
        "model": config.model,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
        "messages": [{ "role": "user", "content": prompt }],
    });

    let response = authenticate(client.post(&url), config.api, key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let json = read_json(response).await?;

    collect_text_parts(&json["content"]).ok_or_else(|| {
        "Unexpected response shape from the provider".to_string()
    })
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

    let json = read_json(response).await?;

    collect_text_parts(&json["candidates"][0]["content"]["parts"]).ok_or_else(|| {
        // A blocked prompt comes back with no candidate at all.
        json["promptFeedback"]["blockReason"]
            .as_str()
            .map(|reason| format!("The provider blocked this request: {reason}"))
            .unwrap_or_else(|| "Unexpected response shape from the provider".to_string())
    })
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

    let json = read_json(response).await?;

    json["message"]["content"]
        .as_str()
        .map(|text| text.to_string())
        .ok_or_else(|| "Unexpected response shape from the provider".to_string())
}

/// Anthropic content blocks, Gemini parts and OpenAI's array-form content all
/// share the same `[{ "text": "..." }]` shape.
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
        ApiFlavor::OpenAi | ApiFlavor::Anthropic => format!("{base_url}/models"),
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
