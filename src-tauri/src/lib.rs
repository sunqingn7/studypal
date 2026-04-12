use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

mod session;
mod database;
mod tts;
mod web_search;
mod translation;

use tts::{EdgeTTS, QwenTTS, TTSRequest, TTSResponse};
use web_search::SearchParams;
use translation::{translate_document, get_translation_cache_dir, clear_translation_cache};

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatRequest {
    endpoint: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProviderChatRequest {
    endpoint: String,
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    temperature: Option<f32>,
    #[serde(rename = "maxTokens")]
    max_tokens: Option<u32>,
    #[serde(rename = "topP")]
    top_p: Option<f32>,
    #[serde(rename = "extraHeaders")]
    extra_headers: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(rename = "extraBody")]
    extra_body: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(rename = "streamEvent")]
    stream_event: Option<String>,
    #[serde(rename = "tools")]
    tools: Option<Vec<serde_json::Value>>,
}

#[tauri::command]
async fn extract_pdf_text(path: String, page_numbers: Option<Vec<u32>>) -> Result<String, String> {
    println!("[RUST] extract_pdf_text called for: {}", path);
    if let Some(ref pages) = page_numbers {
        println!("[RUST] Requested pages: {:?}", pages);
    }
    log::info!("Extracting PDF text from: {}", path);
    
    // Check if file exists
    if !Path::new(&path).exists() {
        let msg = format!("File not found: {}", path);
        println!("[RUST] {}", msg);
        return Err(msg);
    }
    
    // Build pdftotext arguments
    let mut args: Vec<String> = vec!["-layout".to_string(), "-enc".to_string(), "UTF-8".to_string()];
    
    // Add page range if specified
    let page_args: Vec<String> = if let Some(ref pages) = page_numbers {
        if !pages.is_empty() {
            // Convert page numbers to "first-last" format for pdftotext
            let first_page = *pages.iter().min().unwrap_or(&1);
            let last_page = *pages.iter().max().unwrap_or(&first_page);
            vec!["-f".to_string(), first_page.to_string(), "-l".to_string(), last_page.to_string()]
        } else {
            vec![]
        }
    } else {
        vec![]
    };
    args.extend(page_args);
    args.push(path.clone());
    args.push("-".to_string());
    
    // Try to use pdftotext command-line tool (commonly available)
    println!("[RUST] Trying pdftotext with args: {:?}", args);
    let output = Command::new("pdftotext")
        .args(&args)
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                let text = String::from_utf8_lossy(&result.stdout).to_string();
                println!("[RUST] pdftotext succeeded, extracted {} characters", text.len());
                return Ok(text);
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[RUST] pdftotext failed: {}", stderr);
            }
        }
        Err(e) => {
            println!("[RUST] pdftotext not available: {}", e);
        }
    }
    
    // Fallback: try pdf2txt.py (from pdfminer) - doesn't support page ranges well
    // Only use if no specific pages requested
    if page_numbers.is_none() {
        println!("[RUST] Trying pdf2txt.py...");
        let output = Command::new("pdf2txt.py")
            .args(&[&path])
            .output();
        
        match output {
            Ok(result) => {
                if result.status.success() {
                    let text = String::from_utf8_lossy(&result.stdout).to_string();
                    println!("[RUST] pdf2txt.py succeeded, extracted {} characters", text.len());
                    return Ok(text);
                }
            }
            Err(_) => {
                println!("[RUST] pdf2txt.py not available");
            }
        }
    }
    
    // Final fallback: return a helpful message
    println!("[RUST] No PDF text extraction tools available");
    Err("PDF text extraction requires 'pdftotext' (poppler) or 'pdf2txt.py' (pdfminer). Please install one of these tools. On macOS: brew install poppler".to_string())
}

#[tauri::command]
async fn test_invoke() -> Result<String, String> {
    println!("[RUST] test_invoke called!");
    log::info!("Test invoke works!");
    Ok("Hello from Rust!".to_string())
}

#[tauri::command]
async fn fetch_web_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body = response.text().await.map_err(|e| e.to_string())?;

Ok(body)
}

#[tauri::command]
async fn search_web(
    query: String,
    provider: Option<String>,
    api_key: Option<String>,
    max_results: Option<u32>,
    query_type: Option<String>,
    year_from: Option<u32>,
    year_to: Option<u32>,
    pdf_only: Option<bool>,
) -> Result<String, String> {
    println!("[RUST] search_web called with query: {}", query);
    
    let params = SearchParams {
        query,
        provider: provider.unwrap_or_else(|| "duckduckgo".to_string()),
        api_key,
        max_results,
        query_type,
        year_from,
        year_to,
        pdf_only,
    };
    
    // Perform the search
    let mut results = web_search::search(params).await?;
    
    // Apply academic filters if specified
    if pdf_only.unwrap_or(false) || year_from.is_some() || year_to.is_some() {
        results = web_search::filter_academic_results(results, year_from, year_to, pdf_only.unwrap_or(false));
    }
    
    // Convert to JSON string
    serde_json::to_string(&results).map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat_with_ai(request: ChatRequest) -> Result<String, String> {
    println!("[RUST] chat_with_ai called!");
    log::info!("Chat request to endpoint: {}", request.endpoint);
    
    // Return test response for simple test messages
    if request.messages.len() == 1 && request.messages[0].content == "test" {
        println!("[RUST] Returning test response");
        return Ok("Hello from Rust!".to_string());
    }
    
    log::info!("Model: {}", request.model);
    log::info!("Number of messages: {}", request.messages.len());
    println!("[RUST] Messages count: {}", request.messages.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))  // 5 minute timeout for large models
        .build()
        .map_err(|e| e.to_string())?;
        
    let url = format!("{}/v1/chat/completions", request.endpoint);
    println!("[RUST] URL: {}", url);

    let payload = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": false
    });

    println!("[RUST] Sending request...");

    let response = match client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await {
        Ok(resp) => {
            println!("[RUST] Got response with status: {}", resp.status());
            resp
        }
        Err(e) => {
            println!("[RUST] Request failed: {}", e);
            log::error!("Request failed: {}", e);
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        println!("[RUST] HTTP error: {}", status);
        return Err(format!("HTTP error: {}", status));
    }

    println!("[RUST] Parsing JSON response...");
    let data: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            println!("[RUST] JSON parse error: {}", e);
            return Err(format!("JSON parse error: {}", e));
        }
    };

    if let Some(choices) = data.get("choices") {
        println!("[RUST] Found choices");
        if let Some(first) = choices.as_array().and_then(|c| c.first()) {
            println!("[RUST] Found first choice");
            
            // Check for reasoning_content (o1/o3 models)
            let reasoning = first.get("message")
                .and_then(|m| m.get("reasoning_content"))
                .or_else(|| first.get("delta").and_then(|d| d.get("reasoning_content")))
                .and_then(|c| c.as_str());
            
            let content = first.get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .or_else(|| first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()));

            if let Some(content) = content {
                println!("[RUST] Returning message content, length: {}", content.len());
                
                // If there's reasoning content, return as JSON
                if let Some(reasoning) = reasoning {
                    println!("[RUST] Has reasoning content, length: {}", reasoning.len());
                    let response = serde_json::json!({
                        "content": content,
                        "thinking": reasoning
                    });
                    return Ok(response.to_string());
                }
                
                return Ok(content.to_string());
            }
            println!("[RUST] No content found in choice");
        }
    }

    println!("[RUST] Returning error: no valid response");
    Err("No valid response from AI".to_string())
}

#[derive(Debug, Clone, Serialize)]
struct StreamChunk {
    content: String,
    thinking: Option<String>,
    done: bool,
}

#[tauri::command]
async fn chat_with_provider(
    request: ProviderChatRequest,
    provider: String,
) -> Result<String, String> {
    println!("[RUST] chat_with_provider called for provider: {}", provider);
    log::info!("Chat request to provider: {}", provider);
    log::info!("Endpoint: {}", request.endpoint);
    log::info!("Model: {}", request.model);
    println!("[RUST] Messages count: {}", request.messages.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "anthropic" => chat_with_anthropic(&client, &request).await,
        "gemini" => chat_with_gemini(&client, &request).await,
        "openai" | "vllm" | "llamacpp" | "ollama" | "nvidia" | "openrouter" => {
            // These providers use OpenAI-compatible format
            chat_with_openai_compatible(&client, &request).await
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

#[tauri::command]
async fn stream_chat_with_provider(
    app_handle: tauri::AppHandle,
    request: ProviderChatRequest,
    provider: String,
) -> Result<(), String> {
    log::info!("Stream chat request to provider: {}", provider);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    // Use custom event name if provided, otherwise use default
    let stream_event = request.stream_event.clone().unwrap_or_else(|| "chat-stream-chunk".to_string());

    let result = match provider.as_str() {
        "anthropic" => stream_chat_with_anthropic(&app_handle, &client, &request, &stream_event).await,
        "gemini" => stream_chat_with_gemini(&app_handle, &client, &request, &stream_event).await,
        "openai" | "vllm" | "llamacpp" | "ollama" | "nvidia" | "openrouter" => {
            stream_chat_with_openai_compatible(&app_handle, &client, &request, &stream_event).await
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    };

    // Always emit a done event at the end
    let _ = app_handle.emit(&stream_event, StreamChunk {
        content: String::new(),
        thinking: None,
        done: true,
    });

    result
}

#[tauri::command]
async fn chat_with_tools(
    request: ProviderChatRequest,
    provider: String,
) -> Result<serde_json::Value, String> {
    println!("[RUST] chat_with_tools called for provider: {}", provider);
    log::info!("Chat with tools request to provider: {}", provider);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "anthropic" => chat_with_tools_anthropic(&client, &request).await,
        "openai" | "vllm" | "ollama" | "nvidia" | "openrouter" => {
            chat_with_tools_openai_compatible(&client, &request).await
        }
        _ => Err(format!("Unknown provider for tool calling: {}", provider)),
    }
}

async fn chat_with_tools_openai_compatible(
    client: &reqwest::Client,
    request: &ProviderChatRequest,
) -> Result<serde_json::Value, String> {
    let url = if request.endpoint.ends_with("/v1/chat/completions") {
        request.endpoint.clone()
    } else if request.endpoint.ends_with("/v1") {
        format!("{}/chat/completions", request.endpoint)
    } else {
        format!("{}/v1/chat/completions", request.endpoint)
    };

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(request.messages));

    if let Some(tools) = &request.tools {
        payload.insert("tools".to_string(), serde_json::json!(tools));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(max_tokens) = request.max_tokens {
        payload.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
    }

    if let Some(top_p) = request.top_p {
        payload.insert("top_p".to_string(), serde_json::json!(top_p));
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
    }

    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = request_builder
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    // Extract content and tool calls from response
    let mut output = serde_json::Map::new();
    
    if let Some(Choice) = result.get("choices").and_then(|c| c.as_array()) {
        if let Some(first_choice) = Choice.first() {
            if let Some(message) = first_choice.get("message") {
                if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                    output.insert("content".to_string(), serde_json::json!(content));
                }
                
                if let Some(tool_calls) = message.get("tool_calls").and_then(|t| t.as_array()) {
                    output.insert("tool_calls".to_string(), serde_json::json!(tool_calls));
                }
            }
        }
    }

    Ok(serde_json::Value::Object(output))
}

async fn chat_with_tools_anthropic(
    client: &reqwest::Client,
    request: &ProviderChatRequest,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/messages", request.endpoint);
    println!("[RUST] Anthropic tool calling URL: {}", url);

    let mut system_message: Option<String> = None;
    let mut anthropic_messages: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            system_message = Some(msg.content.clone());
        } else {
            anthropic_messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
    }

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(anthropic_messages));
    payload.insert("max_tokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(4096)));

    if let Some(system) = system_message {
        payload.insert("system".to_string(), serde_json::json!(system));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(tools) = &request.tools {
        payload.insert("tools".to_string(), serde_json::json!(tools));
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-api-key", api_key);
    }

    let response = request_builder
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] Anthropic HTTP error: {} - {}", status, error_text);
        return Err(format!("Anthropic HTTP error: {} - {}", status, error_text));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    // Extract content and tool calls from response
    let mut output = serde_json::Map::new();
    
    if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
        let mut content_parts: Vec<String> = vec![];
        let mut tool_calls: Vec<serde_json::Value> = vec![];
        
        for item in content {
            if let Some(text) = item.get("type").and_then(|t| t.as_str()) {
                if text == "text" {
                    if let Some(text_content) = item.get("text").and_then(|t| t.as_str()) {
                        content_parts.push(text_content.to_string());
                    }
                } else if text == "tool_use" {
                    let tool_call = serde_json::json!({
                        "id": item.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                        "type": "function",
                        "function": {
                            "name": item.get("name").and_then(|n| n.as_str()).unwrap_or(""),
                            "arguments": item.get("input").map(|i| i.to_string()).unwrap_or_default()
                        }
                    });
                    tool_calls.push(tool_call);
                }
            }
        }
        
        if !content_parts.is_empty() {
            output.insert("content".to_string(), serde_json::json!(content_parts.join("\n")));
        }
        
        if !tool_calls.is_empty() {
            output.insert("tool_calls".to_string(), serde_json::json!(tool_calls));
        }
    }

    Ok(serde_json::Value::Object(output))
}

#[tauri::command]
async fn stream_chat_with_tools(
    app_handle: tauri::AppHandle,
    request: ProviderChatRequest,
    provider: String,
) -> Result<(), String> {
    println!("[RUST] stream_chat_with_tools called for provider: {}", provider);
    log::info!("Stream chat with tools request to provider: {}", provider);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let stream_event = request.stream_event.clone().unwrap_or_else(|| "chat-stream-chunk".to_string());

    let result = match provider.as_str() {
        "anthropic" => stream_chat_with_tools_anthropic(&app_handle, &client, &request, &stream_event).await,
        "openai" | "vllm" | "ollama" | "nvidia" | "openrouter" => {
            stream_chat_with_tools_openai_compatible(&app_handle, &client, &request, &stream_event).await
        }
        _ => Err(format!("Unknown provider for tool calling: {}", provider)),
    };

    let _ = app_handle.emit(&stream_event, StreamChunk {
        content: String::new(),
        thinking: None,
        done: true,
    });

    result
}

async fn stream_chat_with_tools_openai_compatible(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    request: &ProviderChatRequest,
    stream_event: &str,
) -> Result<(), String> {
    let url = if request.endpoint.ends_with("/v1/chat/completions") {
        request.endpoint.clone()
    } else if request.endpoint.ends_with("/v1") {
        format!("{}/chat/completions", request.endpoint)
    } else {
        format!("{}/v1/chat/completions", request.endpoint)
    };

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(request.messages));
    payload.insert("stream".to_string(), serde_json::json!(true));

    if let Some(tools) = &request.tools {
        payload.insert("tools".to_string(), serde_json::json!(tools));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(max_tokens) = request.max_tokens {
        payload.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
    }

    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = request_builder
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    
    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    if line.starts_with("data: ") {
                        let data = line.trim_start_matches("data: ");
                        if data == "[DONE]" {
                            continue;
                        }
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                                if let Some(choice) = choices.first() {
                                    if let Some(message) = choice.get("message") {
                                        if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                                            let _ = app_handle.emit(stream_event, StreamChunk {
                                                content: content.to_string(),
                                                thinking: None,
                                                done: false,
                                            });
                                        }
                                        if let Some(tool_calls) = message.get("tool_calls").and_then(|t| t.as_array()) {
                                            for tc in tool_calls {
                                                let tool_call_json = serde_json::json!({
                                                    "type": "tool_call",
                                                    "data": tc
                                                });
                                                let _ = app_handle.emit(stream_event, StreamChunk {
                                                    content: String::new(),
                                                    thinking: Some(tool_call_json.to_string()),
                                                    done: false,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("[RUST] Stream error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

async fn stream_chat_with_tools_anthropic(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    request: &ProviderChatRequest,
    stream_event: &str,
) -> Result<(), String> {
    let url = format!("{}/messages", request.endpoint);

    let mut system_message: Option<String> = None;
    let mut anthropic_messages: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            system_message = Some(msg.content.clone());
        } else {
            anthropic_messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
    }

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(anthropic_messages));
    payload.insert("max_tokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(4096)));
    payload.insert("stream".to_string(), serde_json::json!(true));

    if let Some(system) = system_message {
        payload.insert("system".to_string(), serde_json::json!(system));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(tools) = &request.tools {
        payload.insert("tools".to_string(), serde_json::json!(tools));
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01")
        .header("x-stream-events", "true");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-api-key", api_key);
    }

    let response = request_builder
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic HTTP error: {} - {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    
    let mut buffer = String::new();
    
    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);
                
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();
                    
                    if line.is_empty() || line == "event: message_start" || line == "event: content_block_start" || line == "event: content_block_delta" || line == "event: content_block_stop" || line == "event: message_delta" || line == "event: message_stop" {
                        continue;
                    }
                    
                    if line.starts_with("data: ") {
                        let data = line.trim_start_matches("data: ");
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
                                match event_type {
                                    "content_block_delta" => {
                                        if let Some(delta) = event.get("delta") {
                                            if let Some(text_delta) = delta.get("text").and_then(|t| t.as_str()) {
                                                let _ = app_handle.emit(stream_event, StreamChunk {
                                                    content: text_delta.to_string(),
                                                    thinking: None,
                                                    done: false,
                                                });
                                            }
                                            if let Some(input_json) = delta.get("input").and_then(|i| i.as_str()) {
                                                let tool_call_json = serde_json::json!({
                                                    "type": "tool_call",
                                                    "data": input_json
                                                });
                                                let _ = app_handle.emit(stream_event, StreamChunk {
                                                    content: String::new(),
                                                    thinking: Some(tool_call_json.to_string()),
                                                    done: false,
                                                });
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("[RUST] Anthropic stream error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

async fn chat_with_anthropic(
    client: &reqwest::Client,
    request: &ProviderChatRequest,
) -> Result<String, String> {
    println!("[RUST] Using Anthropic API");

    let url = format!("{}/messages", request.endpoint);
    println!("[RUST] URL: {}", url);

    // Convert messages to Anthropic format
    let mut system_message: Option<String> = None;
    let mut anthropic_messages: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            system_message = Some(msg.content.clone());
        } else {
            anthropic_messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
    }

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(anthropic_messages));
    payload.insert("max_tokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(4096)));

    if let Some(system) = system_message {
        payload.insert("system".to_string(), serde_json::json!(system));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(top_p) = request.top_p {
        payload.insert("top_p".to_string(), serde_json::json!(top_p));
    }

    // Add extra body parameters
    if let Some(extra) = &request.extra_body {
        for (key, value) in extra {
            payload.insert(key.clone(), value.clone());
        }
    }

    println!("[RUST] Sending request to Anthropic...");

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01");

    // Add API key if provided
    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-api-key", api_key);
        println!("[RUST] Using provided API key");
    }

    // Add extra headers
    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = match request_builder.json(&payload).send().await {
        Ok(resp) => {
            println!("[RUST] Got response with status: {}", resp.status());
            resp
        }
        Err(e) => {
            println!("[RUST] Request failed: {}", e);
            log::error!("Request failed: {}", e);
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    println!("[RUST] Parsing JSON response...");
    let data: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            println!("[RUST] JSON parse error: {}", e);
            return Err(format!("JSON parse error: {}", e));
        }
    };

    // Debug: Print response keys
    if let Some(obj) = data.as_object() {
        println!("[RUST] Response keys: {:?}", obj.keys().collect::<Vec<_>>());
    }
    
    // Debug: Check for reasoning in various formats
    let reasoning_fields = ["reasoning", "thinking", "reasoning_content", "reasoning_content"];
    for field in reasoning_fields {
        if let Some(val) = data.get(field) {
            println!("[RUST] Found field '{}': {:?}", field, val);
        }
    }

    // Parse Anthropic response format
    if let Some(content) = data.get("content") {
        if let Some(content_array) = content.as_array() {
            let mut full_text = String::new();
            for item in content_array {
                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                    full_text.push_str(text);
                }
            }
            if !full_text.is_empty() {
                // Check for thinking/reasoning in the raw response
                if let Some(reasoning) = data.get("thinking").or_else(|| data.get("reasoning")) {
                    if let Some(reasoning_str) = reasoning.as_str() {
                        let response = serde_json::json!({
                            "content": full_text,
                            "thinking": reasoning_str
                        });
                        return Ok(response.to_string());
                    }
                }
                return Ok(full_text);
            }
        }
    }

    if let Some(error) = data.get("error") {
        let error_msg = error.to_string();
        println!("[RUST] API error: {}", error_msg);
        return Err(format!("Anthropic API error: {}", error_msg));
    }

    println!("[RUST] Returning error: no valid response");
    Err("No valid response from Anthropic".to_string())
}

async fn chat_with_gemini(
    client: &reqwest::Client,
    request: &ProviderChatRequest,
) -> Result<String, String> {
    println!("[RUST] Using Gemini API");

    // Gemini uses a different endpoint format: /models/{model}:generateContent
    let url = format!("{}/models/{}:generateContent", request.endpoint, request.model);
    println!("[RUST] URL: {}", url);

    // Convert messages to Gemini format
    let mut contents: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            // System messages go to systemInstruction
            continue;
        }
        
        let role = if msg.role == "assistant" { "model" } else { "user" };
        contents.push(serde_json::json!({
            "role": role,
            "parts": [{ "text": msg.content }]
        }));
    }

    let mut payload = serde_json::Map::new();
    payload.insert("contents".to_string(), serde_json::json!(contents));

    // Generation config
    let mut generation_config = serde_json::Map::new();
    generation_config.insert("temperature".to_string(), serde_json::json!(request.temperature.unwrap_or(0.7)));
    generation_config.insert("maxOutputTokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(2048)));
    generation_config.insert("topP".to_string(), serde_json::json!(request.top_p.unwrap_or(0.9)));
    generation_config.insert("topK".to_string(), serde_json::json!(40));
    payload.insert("generationConfig".to_string(), serde_json::json!(generation_config));

    println!("[RUST] Sending request to Gemini...");

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    // Add API key - Gemini uses query parameter or x-goog-api-key header
    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-goog-api-key", api_key);
        println!("[RUST] Using provided API key");
    }

    // Add extra headers
    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = match request_builder.json(&payload).send().await {
        Ok(resp) => {
            println!("[RUST] Got response with status: {}", resp.status());
            resp
        }
        Err(e) => {
            println!("[RUST] Request failed: {}", e);
            log::error!("Request failed: {}", e);
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    println!("[RUST] Parsing JSON response...");
    let data: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            println!("[RUST] JSON parse error: {}", e);
            return Err(format!("JSON parse error: {}", e));
        }
    };

    // Debug: Print full response
    println!("[RUST] Full Gemini response: {}", data);
    println!("[RUST] Response type: {}", data);

    // Check for error in response first
    if let Some(error_obj) = data.get("error") {
        println!("[RUST] Gemini API error: {}", error_obj);
        let error_msg = error_obj.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        return Err(format!("Gemini API error: {}", error_msg));
    }

    // Parse Gemini response format - try multiple possible paths
    let mut full_text = String::new();
    
    // Path 1: candidates[0].content.parts[].text
    if let Some(candidates) = data.get("candidates").and_then(|c| c.as_array()) {
        if let Some(first_candidate) = candidates.first() {
            println!("[RUST] Found candidate: {:?}", first_candidate);
            if let Some(content) = first_candidate.get("content") {
                if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                    for part in parts {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            full_text.push_str(text);
                        }
                    }
                }
            }
        }
    }
    
    if !full_text.is_empty() {
        return Ok(full_text);
    }
    
    // Path 2: candidates[0].text (some responses use this)
    if let Some(candidates) = data.get("candidates").and_then(|c| c.as_array()) {
        if let Some(first_candidate) = candidates.first() {
            if let Some(text) = first_candidate.get("text").and_then(|t| t.as_str()) {
                return Ok(text.to_string());
            }
        }
    }
    
    // Path 3: promptFeedback (model generated no content)
    if data.get("promptFeedback").is_some() {
        println!("[RUST] Prompt was blocked or filtered");
        return Err("Prompt was blocked or content was filtered".to_string());
    }
    
    // If we get here, we couldn't parse the response
    println!("[RUST] Could not extract text from Gemini response");
    println!("[RUST] Available keys: {:?}", data.as_object().map(|o| o.keys().collect::<Vec<_>>()));

    if let Some(error) = data.get("error") {
        let error_msg = error.to_string();
        println!("[RUST] API error: {}", error_msg);
        return Err(format!("Gemini API error: {}", error_msg));
    }

    println!("[RUST] Returning error: no valid response");
    Err("No valid response from Gemini".to_string())
}

async fn chat_with_openai_compatible(
    client: &reqwest::Client,
    request: &ProviderChatRequest,
) -> Result<String, String> {
    println!("[RUST] Using OpenAI-compatible API");

    // Determine the URL based on endpoint format
    let url = if request.endpoint.ends_with("/v1/chat/completions") {
        request.endpoint.clone()
    } else if request.endpoint.ends_with("/v1") {
        format!("{}/chat/completions", request.endpoint)
    } else {
        format!("{}/v1/chat/completions", request.endpoint)
    };

    println!("[RUST] URL: {}", url);

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(request.messages));
    payload.insert("stream".to_string(), serde_json::json!(false));

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(max_tokens) = request.max_tokens {
        payload.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
    }

    if let Some(top_p) = request.top_p {
        payload.insert("top_p".to_string(), serde_json::json!(top_p));
    }

    // Add extra body parameters
    if let Some(extra) = &request.extra_body {
        for (key, value) in extra {
            payload.insert(key.clone(), value.clone());
        }
    }

    println!("[RUST] Sending request...");

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    // Add authorization header if API key is provided
    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
        println!("[RUST] Using provided API key");
    }

    // Add extra headers
    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = match request_builder.json(&payload).send().await {
        Ok(resp) => {
            println!("[RUST] Got response with status: {}", resp.status());
            resp
        }
        Err(e) => {
            let error_type = e.to_string();
            println!("[RUST] Request failed: {}", e);
            println!("[RUST] Error type: {}", error_type);
            log::error!("Request failed: {}", e);
            return Err(format!("Request failed: {} - {}", error_type, e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    println!("[RUST] Parsing JSON response...");
    let data: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            println!("[RUST] JSON parse error: {}", e);
            return Err(format!("JSON parse error: {}", e));
        }
    };

    if let Some(choices) = data.get("choices") {
        println!("[RUST] Found choices");
        if let Some(first) = choices.as_array().and_then(|c| c.first()) {
            println!("[RUST] Found first choice");
            
            // Check for reasoning_content (o1/o3 models)
            let reasoning = first.get("message")
                .and_then(|m| m.get("reasoning_content"))
                .or_else(|| first.get("delta").and_then(|d| d.get("reasoning_content")))
                .and_then(|c| c.as_str());
            
            let content = first.get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .or_else(|| first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()));

            if let Some(content) = content {
                println!("[RUST] Returning message content, length: {}", content.len());
                
                // If there's reasoning content, return as JSON
                if let Some(reasoning) = reasoning {
                    println!("[RUST] Has reasoning content, length: {}", reasoning.len());
                    let response = serde_json::json!({
                        "content": content,
                        "thinking": reasoning
                    });
                    return Ok(response.to_string());
                }
                
                return Ok(content.to_string());
            }
            println!("[RUST] No content found in choice");
        }
    }

    if let Some(error) = data.get("error") {
        let error_msg = error.to_string();
        println!("[RUST] API error: {}", error_msg);
        return Err(format!("API error: {}", error_msg));
    }

    println!("[RUST] Returning error: no valid response");
    Err("No valid response from AI".to_string())
}

// Streaming functions for real-time chat
use futures::StreamExt;

async fn stream_chat_with_openai_compatible(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    request: &ProviderChatRequest,
    stream_event: &str,
) -> Result<(), String> {

    let url = if request.endpoint.ends_with("/v1/chat/completions") {
        request.endpoint.clone()
    } else if request.endpoint.ends_with("/v1") {
        format!("{}/chat/completions", request.endpoint)
    } else {
        format!("{}/v1/chat/completions", request.endpoint)
    };


    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(request.messages));
    payload.insert("stream".to_string(), serde_json::json!(true));

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(max_tokens) = request.max_tokens {
        payload.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
    }

    if let Some(top_p) = request.top_p {
        payload.insert("top_p".to_string(), serde_json::json!(top_p));
    }

    if let Some(extra) = &request.extra_body {
        for (key, value) in extra {
            payload.insert(key.clone(), value.clone());
        }
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
    }

    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = match request_builder.json(&payload).send().await {
        Ok(resp) => {
            resp
        }
        Err(e) => {
            println!("[RUST] Streaming request failed: {}", e);
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);
                
                // Process complete SSE lines
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].to_string();
                    buffer = buffer[pos + 1..].to_string();
                    
                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        if data == "[DONE]" {
                            return Ok(());
                        }
                        
            // Parse the SSE data
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
              if let Some(choices) = json.get("choices") {
                if let Some(first) = choices.as_array().and_then(|c| c.first()) {
                  let content = first.get("delta")
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("");
                  
                  let reasoning = first.get("delta")
                    .and_then(|d| d.get("reasoning_content"))
                    .and_then(|c| c.as_str())
                    .or_else(|| {
                      // Try alternative field names for reasoning/thinking
                      first.get("delta")
                        .and_then(|d| d.get("reasoning"))
                        .and_then(|c| c.as_str())
                    });
                  
            // Emit chunk to frontend using custom event name
                    if !content.is_empty() || reasoning.is_some() {
                        let _ = app_handle.emit(stream_event, StreamChunk {
                            content: content.to_string(),
                            thinking: reasoning.map(|s| s.to_string()),
                            done: false,
                        });
                    }
                }
              }
            }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    Ok(())
}

async fn stream_chat_with_anthropic(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    request: &ProviderChatRequest,
    stream_event: &str,
) -> Result<(), String> {

    let url = format!("{}/messages", request.endpoint);

    // Convert messages to Anthropic format
    let mut system_message: Option<String> = None;
    let mut anthropic_messages: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            system_message = Some(msg.content.clone());
        } else {
            anthropic_messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
    }

    let mut payload = serde_json::Map::new();
    payload.insert("model".to_string(), serde_json::json!(request.model));
    payload.insert("messages".to_string(), serde_json::json!(anthropic_messages));
    payload.insert("max_tokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(4096)));
    payload.insert("stream".to_string(), serde_json::json!(true));

    if let Some(system) = system_message {
        payload.insert("system".to_string(), serde_json::json!(system));
    }

    if let Some(temp) = request.temperature {
        payload.insert("temperature".to_string(), serde_json::json!(temp));
    }

    if let Some(top_p) = request.top_p {
        payload.insert("top_p".to_string(), serde_json::json!(top_p));
    }

    if let Some(extra) = &request.extra_body {
        for (key, value) in extra {
            payload.insert(key.clone(), value.clone());
        }
    }

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01");

    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-api-key", api_key);
    }

    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = match request_builder.json(&payload).send().await {
        Ok(resp) => {
            resp
        }
        Err(e) => {
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);
                
                // Process complete SSE lines
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].to_string();
                    buffer = buffer[pos + 1..].to_string();
                    
                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            let event_type = json.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            
                            match event_type {
                                "content_block_delta" => {
                                    if let Some(delta) = json.get("delta") {
                                        if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                            let _ = app_handle.emit(stream_event, StreamChunk {
                                                content: text.to_string(),
                                                thinking: None,
                                                done: false,
                                            });
                                        }
                                    }
                                }
                                "message_stop" => {
                                    return Ok(());
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    Ok(())
}

async fn stream_chat_with_gemini(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    request: &ProviderChatRequest,
    stream_event: &str,
) -> Result<(), String> {
    println!("[RUST] Using Gemini Streaming API");

    // Gemini uses a different endpoint format for streaming: /models/{model}:streamGenerateContent
    let url = format!("{}/models/{}:streamGenerateContent?alt=sse", request.endpoint, request.model);
    println!("[RUST] Streaming URL: {}", url);

    // Convert messages to Gemini format
    let mut contents: Vec<serde_json::Value> = vec![];

    for msg in &request.messages {
        if msg.role == "system" {
            continue;
        }
        
        let role = if msg.role == "assistant" { "model" } else { "user" };
        contents.push(serde_json::json!({
            "role": role,
            "parts": [{ "text": msg.content }]
        }));
    }

    let mut payload = serde_json::Map::new();
    payload.insert("contents".to_string(), serde_json::json!(contents));

    // Generation config
    let mut generation_config = serde_json::Map::new();
    generation_config.insert("temperature".to_string(), serde_json::json!(request.temperature.unwrap_or(0.7)));
    generation_config.insert("maxOutputTokens".to_string(), serde_json::json!(request.max_tokens.unwrap_or(2048)));
    generation_config.insert("topP".to_string(), serde_json::json!(request.top_p.unwrap_or(0.9)));
    generation_config.insert("topK".to_string(), serde_json::json!(40));
    payload.insert("generationConfig".to_string(), serde_json::json!(generation_config));

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    // Add API key
    if let Some(api_key) = &request.api_key {
        request_builder = request_builder.header("x-goog-api-key", api_key);
    }

    // Add extra headers
    if let Some(headers) = &request.extra_headers {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request_builder = request_builder.header(key, val_str);
            }
        }
    }

    let response = request_builder
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);
                
                // Process complete SSE lines
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].to_string();
                    buffer = buffer[pos + 1..].to_string();
                    
                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        
                        // Try to parse the JSON
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            // Gemini streaming format
                            if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
                                if let Some(first) = candidates.first() {
                                    if let Some(content) = first.get("content") {
                                        if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                                            for part in parts {
                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                            let _ = app_handle.emit(stream_event, StreamChunk {
                                                content: text.to_string(),
                                                thinking: None,
                                                done: false,
                                            });
                                        }
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Check for done
                            if let Some(finish_reason) = json.get("candidates")
                                .and_then(|c| c.as_array())
                                .and_then(|c| c.first())
                                .and_then(|c| c.get("finishReason"))
                            {
                                if !finish_reason.is_null() {
                                    return Ok(());
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    Ok(())
}

use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
struct FileItem {
  name: String,
  path: String,
  #[serde(rename = "type")]
  file_type: String,
  extension: Option<String>,
  size: Option<u64>,
  last_modified: Option<u64>,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileItem>, String> {
  let entries = fs::read_dir(&path)
    .map_err(|e| format!("Failed to read directory: {}", e))?;
  
  let mut items = Vec::new();
  
  for entry in entries {
    if let Ok(entry) = entry {
      let metadata = entry.metadata().ok();
      let path = entry.path();
      let name = entry.file_name().to_string_lossy().to_string();
      let extension = path.extension()
        .map(|e| e.to_string_lossy().to_string());
      
      let file_type = if metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false) {
        "directory"
      } else {
        "file"
      }.to_string();
      
      let size = metadata.as_ref().map(|m| m.len());
      let last_modified = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
      
      items.push(FileItem {
        name,
        path: path.to_string_lossy().to_string(),
        file_type,
        extension,
        size,
        last_modified,
      });
    }
  }
  
  Ok(items)
}

#[tauri::command]
fn get_parent_directory(file_path: String) -> Result<String, String> {
  let path = PathBuf::from(&file_path);
  let parent = path.parent()
    .ok_or_else(|| "Cannot get parent directory".to_string())?;
  parent.to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "Invalid path encoding".to_string())
}

#[tauri::command]
fn get_file_info(file_path: String) -> Result<FileItem, String> {
  let path = PathBuf::from(&file_path);
  
  // Check if file exists
  if !path.exists() {
    return Err(format!("File not found: {}", file_path));
  }
  
  let metadata = fs::metadata(&path)
    .map_err(|e| format!("Failed to get metadata: {}", e))?;
  
  let name = path.file_name()
    .map(|n| n.to_string_lossy().to_string())
    .unwrap_or_default();
  
  let extension = path.extension()
    .map(|e| e.to_string_lossy().to_string())
    .filter(|s| !s.is_empty());
  
  let file_type = if metadata.is_dir() {
    "directory"
  } else {
    "file"
  }.to_string();
  
  let size = metadata.len();
  let last_modified = metadata
    .modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs());
  
  Ok(FileItem {
    name,
    path: file_path,
    file_type,
    extension,
    size: Some(size),
    last_modified,
  })
}

#[derive(Debug, Serialize, Deserialize)]
struct FileOpenResult {
  path: String,
  name: String,
  extension: Option<String>,
  size: u64,
  content: Option<Vec<u8>>,
}

#[tauri::command]
async fn read_file(file_path: String) -> Result<FileOpenResult, String> {
    let path = PathBuf::from(&file_path);

    // Check if file exists
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Check if it's a file (not directory)
    if path.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", file_path));
    }

    // Get metadata
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;

    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let extension = path.extension()
        .map(|e| e.to_string_lossy().to_string())
        .filter(|s| !s.is_empty());

    let size = metadata.len();

    // Read file content for files under 10MB
    let content = if size < 10_000_000 {
        match fs::read(&path) {
            Ok(data) => Some(data),
            Err(e) => {
                println!("[RUST] Warning: Could not read file content: {}", e);
                None
            }
        }
    } else {
        println!("[RUST] File too large to read into memory: {} bytes", size);
        None
    };

    println!("[RUST] Read file: {} ({} bytes)", name, size);

    Ok(FileOpenResult {
        path: file_path,
        name,
        extension,
        size,
        content,
    })
}

#[tauri::command]
async fn open_file_from_browser(file_path: String) -> Result<FileOpenResult, String> {
  let path = PathBuf::from(&file_path);
  
  // Check if file exists
  if !path.exists() {
    return Err(format!("File not found: {}", file_path));
  }
  
  // Check if it's a file (not directory)
  if path.is_dir() {
    return Err(format!("Path is a directory, not a file: {}", file_path));
  }
  
  // Get metadata
  let metadata = fs::metadata(&path)
    .map_err(|e| format!("Failed to get metadata: {}", e))?;
  
  let name = path.file_name()
    .map(|n| n.to_string_lossy().to_string())
    .unwrap_or_default();
  
  let extension = path.extension()
    .map(|e| e.to_string_lossy().to_string())
    .filter(|s| !s.is_empty());
  
  let size = metadata.len();
  
  // Read file content for text files (under 10MB)
  let content = if size < 10_000_000 {
    match fs::read(&path) {
      Ok(data) => Some(data),
      Err(e) => {
        println!("[RUST] Warning: Could not read file content: {}", e);
        None
      }
    }
  } else {
    println!("[RUST] File too large to read into memory: {} bytes", size);
    None
  };
  
  println!("[RUST] Opened file from browser: {} ({} bytes)", name, size);
  
  Ok(FileOpenResult {
    path: file_path,
    name,
    extension,
    size,
    content,
  })
}

use std::io::Read;

#[tauri::command]
async fn extract_epub_text(file_path: String) -> Result<String, String> {
  use zip::ZipArchive;
  use std::fs::File;

  println!("[RUST] extract_epub_text called for: {}", file_path);

  // Check if file exists
  if !Path::new(&file_path).exists() {
    return Err(format!("File not found: {}", file_path));
  }

  // Read container.xml to find OPF path
  let opf_path = {
    let file = File::open(&file_path)
      .map_err(|e| format!("Failed to open EPUB: {}", e))?;
    let mut archive = ZipArchive::new(file)
      .map_err(|e| format!("Failed to read EPUB: {}", e))?;
    
    let mut container_file = archive.by_name("META-INF/container.xml")
      .map_err(|e| format!("Failed to read container.xml: {}", e))?;
    let mut container_content = String::new();
    container_file.read_to_string(&mut container_content)
      .map_err(|e| format!("Failed to read container content: {}", e))?;
    
    parse_container_for_opf(&container_content)?
  };
  
  println!("[RUST] Found OPF at: {}", opf_path);

  // Read OPF file to get content files
  let content_files = {
    let file = File::open(&file_path)
      .map_err(|e| format!("Failed to open EPUB: {}", e))?;
    let mut archive = ZipArchive::new(file)
      .map_err(|e| format!("Failed to read EPUB: {}", e))?;
    
    let mut opf_file = archive.by_name(&opf_path)
      .map_err(|e| format!("Failed to read OPF: {}", e))?;
    let mut opf_content = String::new();
    opf_file.read_to_string(&mut opf_content)
      .map_err(|e| format!("Failed to read OPF content: {}", e))?;
    
    let base_dir = Path::new(&opf_path)
      .parent()
      .map(|p| p.to_str().unwrap_or("")
      .to_string())
      .unwrap_or_default();
    
    let files = parse_opf_for_content(&opf_content)?;
    
    // Build full paths
    files.into_iter()
      .map(|f| {
        if base_dir.is_empty() {
          f
        } else {
          format!("{}/{}", base_dir, f)
        }
      })
      .collect::<Vec<String>>()
  };
  
  println!("[RUST] Found {} content files", content_files.len());

  // Read all content files
  let mut contents: Vec<String> = Vec::new();
  {
    let file = File::open(&file_path)
      .map_err(|e| format!("Failed to open EPUB: {}", e))?;
    let mut archive = ZipArchive::new(file)
      .map_err(|e| format!("Failed to read EPUB: {}", e))?;
    
    for full_path in content_files {
      match archive.by_name(&full_path) {
        Ok(mut file) => {
          let mut content = String::new();
          if file.read_to_string(&mut content).is_ok() {
            contents.push(content);
          }
        }
        Err(e) => {
          println!("[RUST] Warning: Could not read {}: {}", full_path, e);
        }
      }
    }
  }

  // Process and concatenate all content
  let mut full_text = String::new();
  for content in contents {
    let plain_text = strip_html_tags(&content);
    full_text.push_str(&plain_text);
    full_text.push('\n');
  }

  println!("[RUST] Extracted {} characters from EPUB", full_text.len());
  Ok(full_text)
}

fn parse_container_for_opf(container: &str) -> Result<String, String> {
  let doc = roxmltree::Document::parse(container)
    .map_err(|e| format!("Failed to parse container.xml: {}", e))?;
  
  for node in doc.descendants() {
    if node.tag_name().name() == "rootfile" {
      if let Some(path) = node.attribute("full-path") {
        return Ok(path.to_string());
      }
    }
  }
  
  Err("Could not find full-path in container.xml".to_string())
}

fn parse_opf_for_content(opf: &str) -> Result<Vec<String>, String> {
  let doc = roxmltree::Document::parse(opf)
    .map_err(|e| format!("Failed to parse OPF: {}", e))?;
  
  let mut content_files = Vec::new();
  
  for node in doc.descendants() {
    if node.tag_name().name() == "item" {
      if let Some(media_type) = node.attribute("media-type") {
        if media_type == "application/xhtml+xml" || media_type == "text/html" {
          if let Some(href) = node.attribute("href") {
            content_files.push(href.to_string());
          }
        }
      }
    }
  }
  
  // Sort by reading order if possible (idref matching)
  // For now, return in manifest order
  Ok(content_files)
}

fn strip_html_tags(html: &str) -> String {
  // Simple HTML tag removal
  // Remove script and style tags with content
  let mut result = html.to_string();
  
  // Remove script tags
  while let Some(start) = result.find("<script") {
    if let Some(end) = result[start..].find("</script>") {
      result.replace_range(start..start + end + 9, "");
    } else {
      break;
    }
  }
  
  // Remove style tags
  while let Some(start) = result.find("<style") {
    if let Some(end) = result[start..].find("</style>") {
      result.replace_range(start..start + end + 8, "");
    } else {
      break;
    }
  }
  
  // Remove all remaining tags
  let mut output = String::new();
  let mut in_tag = false;
  
  for c in result.chars() {
    if c == '<' {
      in_tag = true;
    } else if c == '>' {
      in_tag = false;
      output.push(' ');
    } else if !in_tag {
      output.push(c);
    }
  }
  
// Normalize whitespace
output.split_whitespace().collect::<Vec<&str>>().join(" ")
}

#[derive(Debug, Serialize, Deserialize)]
struct FetchModelsRequest {
    endpoint: String,
    api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModelInfo {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_window: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[tauri::command]
async fn fetch_models(request: FetchModelsRequest) -> Result<Vec<ModelInfo>, String> {
    println!("[RUST] fetch_models called!");
    println!("[RUST] Endpoint: {}", request.endpoint);
    log::info!("Fetching models from: {}", request.endpoint);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Determine the URL based on endpoint format
    let url = if request.endpoint.ends_with("/v1/models") {
        request.endpoint.clone()
    } else if request.endpoint.contains("generativelanguage.googleapis.com") {
        // Gemini uses v1beta for models
        if request.endpoint.ends_with("/v1beta") {
            format!("{}/models", request.endpoint)
        } else if request.endpoint.ends_with("/v1beta/models") {
            request.endpoint.clone()
        } else {
            format!("{}/v1beta/models", request.endpoint)
        }
    } else if request.endpoint.ends_with("/v1") {
        format!("{}/models", request.endpoint)
    } else {
        format!("{}/v1/models", request.endpoint)
    };

    println!("[RUST] URL: {}", url);

    let mut request_builder = client.get(&url);

    // Check if this is a Gemini endpoint
    let is_gemini = url.contains("generativelanguage.googleapis.com");
    
    // Add authorization header if API key is provided
    if let Some(api_key) = &request.api_key {
        if is_gemini {
            // Gemini uses x-goog-api-key header
            request_builder = request_builder.header("x-goog-api-key", api_key);
            println!("[RUST] Using x-goog-api-key for Gemini");
        } else if url.contains("openrouter.ai") {
            // OpenRouter uses Authorization: Bearer
            request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
            println!("[RUST] Using Bearer token for OpenRouter");
        } else {
            // Default: Authorization: Bearer
            request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
            println!("[RUST] Using Bearer token");
        }
    }

    let response = match request_builder.send().await {
        Ok(resp) => {
            println!("[RUST] Got response with status: {}", resp.status());
            resp
        }
        Err(e) => {
            println!("[RUST] Request failed: {}", e);
            log::error!("Request failed: {}", e);
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] HTTP error: {} - {}", status, error_text);
        return Err(format!("HTTP error: {} - {}", status, error_text));
    }

    println!("[RUST] Parsing JSON response...");
    let data: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            println!("[RUST] JSON parse error: {}", e);
            return Err(format!("JSON parse error: {}", e));
        }
    };

  // Parse models from response
  let mut models: Vec<ModelInfo> = vec![];

  // Helper function to extract numeric value from various formats
  let extract_number = |v: &serde_json::Value| -> Option<u32> {
    v.as_u64().map(|n| n as u32)
      .or_else(|| v.as_f64().map(|n| n as u32))
      .or_else(|| v.as_str().and_then(|s| s.parse::<u32>().ok()))
  };

  // Try different response formats
  if let Some(models_array) = data.get("data").and_then(|d| d.as_array()) {
    // OpenAI format: { data: [{ id: "...", ... }] }
    for model in models_array {
      if let Some(id) = model.get("id").and_then(|i| i.as_str()) {
        // Try various field names for context window / max tokens
        let context_window = model.get("context_window").and_then(extract_number)
          .or_else(|| model.get("context_length").and_then(extract_number))
          .or_else(|| model.get("max_context_length").and_then(extract_number));
        
        let max_tokens = model.get("max_tokens").and_then(extract_number)
          .or_else(|| model.get("max_model_len").and_then(extract_number))
          .or_else(|| model.get("max_position_embeddings").and_then(extract_number));

        models.push(ModelInfo {
          id: id.to_string(),
          name: model.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
          description: model.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
          context_window,
          max_tokens,
        });
      }
    }
  } else if let Some(models_array) = data.get("models").and_then(|m| m.as_array()) {
    // Some providers use { models: [...] }
    // Also handle Gemini format: { models: [{ name: "models/...", displayName: "...", inputTokenLimit: ..., outputTokenLimit: ... }] }
    for model in models_array {
      // Try id field first
      if let Some(id) = model.get("id").and_then(|i| i.as_str()) {
        let context_window = model.get("context_window").and_then(extract_number)
          .or_else(|| model.get("context_length").and_then(extract_number))
          .or_else(|| model.get("max_context_length").and_then(extract_number));
        
        let max_tokens = model.get("max_tokens").and_then(extract_number)
          .or_else(|| model.get("max_model_len").and_then(extract_number))
          .or_else(|| model.get("max_position_embeddings").and_then(extract_number));

        models.push(ModelInfo {
          id: id.to_string(),
          name: model.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
          description: model.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
          context_window,
          max_tokens,
        });
      } else if let Some(name) = model.get("name").and_then(|n| n.as_str()) {
        // Gemini format: name is "models/gemini-1.5-flash"
        let display_name = model.get("displayName").and_then(|d| d.as_str()).map(|s| s.to_string());
        let description = model.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());
        let input_limit = model.get("inputTokenLimit").and_then(extract_number);
        let output_limit = model.get("outputTokenLimit").and_then(extract_number);

        // Extract model id from name (e.g., "models/gemini-1.5-flash" -> "gemini-1.5-flash")
        let model_id = name.strip_prefix("models/").unwrap_or(name).to_string();

        models.push(ModelInfo {
          id: model_id,
          name: display_name,
          description,
          context_window: input_limit,
          max_tokens: output_limit,
        });
      }
    }
  }

    if models.is_empty() {
        println!("[RUST] No models found in response");
        return Err("No models found".to_string());
    }

    println!("[RUST] Found {} models", models.len());
    Ok(models)
}

#[tauri::command]
async fn tts_edge_voices() -> Result<serde_json::Value, String> {
    let tts = EdgeTTS::new();
    let voices = tts.get_voices().await?;
    serde_json::to_value(voices).map_err(|e| format!("Failed to serialize voices: {}", e))
}

#[tauri::command]
async fn tts_edge_synth(request: TTSRequest) -> Result<TTSResponse, String> {
    let tts = EdgeTTS::new();
    tts.synthesize(request).await
}

#[tauri::command]
async fn tts_qwen_health(server_url: Option<String>) -> Result<bool, String> {
    let tts = QwenTTS::new(server_url);
    tts.health_check().await
}

#[tauri::command]
async fn tts_qwen_voices(server_url: Option<String>) -> Result<serde_json::Value, String> {
    let tts = QwenTTS::new(server_url);
    let voices = tts.get_voices().await?;
    serde_json::to_value(voices).map_err(|e| format!("Failed to serialize voices: {}", e))
}

#[tauri::command]
async fn download_and_open_paper(
    url: String,
    save_location: Option<String>,
) -> Result<DownloadResult, String> {
    println!("[RUST] download_and_open_paper called with url: {}", url);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    
    // Determine save location
    let save_path = if let Some(loc) = save_location {
        loc
    } else {
        // Default to ~/StudyMaterials/Papers/
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Could not determine home directory".to_string())?;
        format!("{}/StudyMaterials/Papers", home)
    };
    
    // Create directory if it doesn't exist
    std::fs::create_dir_all(&save_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    // Extract filename from URL
    let filename = url.split('/').last()
        .unwrap_or("paper.pdf")
        .to_string();
    
    // Ensure it has .pdf extension
    let filename = if filename.ends_with(".pdf") {
        filename
    } else {
        format!("{}.pdf", filename)
    };
    
    let filepath = format!("{}/{}", save_path, filename);
    
    // Download the file
    println!("[RUST] Downloading from: {} to: {}", url, filepath);
    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Save to file
    std::fs::write(&filepath, &bytes)
        .map_err(|e| format!("Failed to save file: {}", e))?;
    
    // Try to extract metadata from arxiv URL
    let (title, authors, year) = if url.contains("arxiv.org") {
        let arxiv_id = url.split('/').last()
            .and_then(|s| s.split('.').next())
            .unwrap_or("");
        let year = if arxiv_id.len() >= 2 {
            arxiv_id[..2].parse::<u32>().ok().map(|y| 2000 + y)
        } else {
            None
        };
        (Some(format!("Paper {}", arxiv_id)), None, year)
    } else {
        (None, None, None)
    };
    
    println!("[RUST] Downloaded {} bytes to {}", bytes.len(), filepath);
    
    Ok(DownloadResult {
        path: filepath,
        title,
        authors,
        year,
        file_size: bytes.len() as u64,
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadResult {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    authors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<u32>,
    file_size: u64,
}

#[tauri::command]
async fn tts_qwen_synth(request: TTSRequest, server_url: Option<String>) -> Result<TTSResponse, String> {
    let tts = QwenTTS::new(server_url);
    tts.synthesize(request).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      fetch_web_content,
      search_web,
      download_and_open_paper,
      chat_with_ai,
            chat_with_provider,
            stream_chat_with_provider,
            chat_with_tools,
            stream_chat_with_tools,
            fetch_models,
            test_invoke,
            extract_pdf_text,
            extract_epub_text,
            list_directory,
            get_parent_directory,
            get_file_info,
            open_file_from_browser,
            read_file,
            tts_edge_voices,
            tts_edge_synth,
            tts_qwen_health,
            tts_qwen_voices,
            tts_qwen_synth,
            translate_document,
            get_translation_cache_dir,
            clear_translation_cache,
        session::load_session,
        session::save_session,
        session::save_chats,
        session::load_chats,
        session::save_notes,
        session::load_notes,
        session::save_note_tabs,
        session::load_note_tabs,
        session::delete_document_data,
      session::save_note_as_markdown,
      session::load_note_from_markdown,
      session::load_all_notes_from_markdown,
      session::delete_note_markdown,
      session::save_document_metadata,
      session::load_document_metadata,
      session::get_document_with_context,
        session::debug_list_all_metadata,
        session::debug_list_all_chats
        ])
        .setup(|app| {
            let _app_handle = app.handle().clone();
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            log::info!("StudyPal started successfully");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
