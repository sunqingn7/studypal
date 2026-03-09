use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

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

// File system commands for persistence
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
  println!("[RUST] write_file called for: {}", path);
  
  // Create parent directory if it doesn't exist
  if let Some(parent) = Path::new(&path).parent() {
    if let Err(e) = fs::create_dir_all(parent) {
      return Err(format!("Failed to create directory: {}", e));
    }
  }
  
  fs::write(&path, content)
    .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
  println!("[RUST] read_text_file called for: {}", path);
  
  fs::read_to_string(&path)
    .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn file_exists(path: String) -> Result<bool, String> {
  Ok(Path::new(&path).exists() && Path::new(&path).is_file())
}

#[tauri::command]
async fn directory_exists(path: String) -> Result<bool, String> {
  Ok(Path::new(&path).exists() && Path::new(&path).is_dir())
}

#[tauri::command]
async fn ensure_directory_exists(path: String) -> Result<(), String> {
  println!("[RUST] ensure_directory_exists called for: {}", path);
  
  fs::create_dir_all(&path)
    .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
async fn list_files(path: String) -> Result<Vec<String>, String> {
  println!("[RUST] list_files called for: {}", path);
  
  let entries = fs::read_dir(&path)
    .map_err(|e| format!("Failed to read directory: {}", e))?;
  
  let mut files = Vec::new();
  for entry in entries {
    if let Ok(entry) = entry {
      let path = entry.path();
      if path.is_file() {
        files.push(path.to_string_lossy().to_string());
      }
    }
  }
  
  Ok(files)
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
      chat_with_ai,
      test_invoke,
      extract_pdf_text,
      extract_epub_text,
      list_directory,
      get_parent_directory,
      get_file_info,
      open_file_from_browser,
      read_file,
      write_file,
      read_text_file,
      file_exists,
      directory_exists,
      ensure_directory_exists,
      list_files
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
