use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::Path;

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

#[tauri::command]
async fn extract_pdf_text(path: String) -> Result<String, String> {
    println!("[RUST] extract_pdf_text called for: {}", path);
    log::info!("Extracting PDF text from: {}", path);
    
    // Check if file exists
    if !Path::new(&path).exists() {
        let msg = format!("File not found: {}", path);
        println!("[RUST] {}", msg);
        return Err(msg);
    }
    
    // Load PDF using lopdf
    let doc = match lopdf::Document::load(&path) {
        Ok(d) => d,
        Err(e) => {
            let msg = format!("Failed to load PDF: {}", e);
            println!("[RUST] {}", msg);
            return Err(msg);
        }
    };
    
    println!("[RUST] PDF loaded, extracting text...");
    
    // Extract text from all pages
    let mut text_parts: Vec<String> = Vec::new();
    let page_numbers: Vec<u32> = doc.get_pages().into_keys().collect();
    
    for page_num in page_numbers {
        match doc.extract_text(&[page_num]) {
            Ok(page_text) => {
                let trimmed = page_text.trim();
                if !trimmed.is_empty() {
                    text_parts.push(format!("--- Page {} ---\n{}", page_num, trimmed));
                }
            }
            Err(e) => {
                println!("[RUST] Error extracting text from page {}: {}", page_num, e);
            }
        }
    }
    
    let full_text = text_parts.join("\n\n");
    println!("[RUST] Extracted {} characters from {} pages", full_text.len(), text_parts.len());
    
    if full_text.len() > 500 {
        println!("[RUST] Preview: {}...", &full_text[..500.min(full_text.len())]);
    }
    
    Ok(full_text)
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
async fn search_web(query: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let search_url = format!(
        "https://ddg-api.vercel.app/search?q={}&max_results=5",
        urlencoding::encode(&query)
    );

    let response = client
        .get(&search_url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(body)
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
        .timeout(std::time::Duration::from_secs(60))
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
            if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                println!("[RUST] Returning message content, length: {}", content.len());
                return Ok(content.to_string());
            }
            if let Some(content) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                println!("[RUST] Returning delta content, length: {}", content.len());
                return Ok(content.to_string());
            }
            println!("[RUST] No content found in choice");
        }
    }

    println!("[RUST] Returning error: no valid response");
    Err("No valid response from AI".to_string())
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
        .invoke_handler(tauri::generate_handler![fetch_web_content, search_web, chat_with_ai, test_invoke, extract_pdf_text])
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
