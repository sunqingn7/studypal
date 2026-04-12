use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateRequest {
    input_path: String,
    source_lang: String,
    target_lang: String,
    pages: Option<Vec<i32>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateResponse {
    success: bool,
    output_paths: Vec<String>,
    error: Option<String>,
}

fn get_cache_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".studypal").join("translations")
}

fn ensure_cache_dir() -> Result<PathBuf, String> {
    let cache_dir = get_cache_dir();
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    Ok(cache_dir)
}

fn get_doc_cache_dir(doc_path: &str) -> Result<PathBuf, String> {
    let cache_dir = ensure_cache_dir()?;
    
    // Create a simple hash from document path
    let doc_hash = format!("{:x}", md5_hash(doc_path));
    let doc_dir = cache_dir.join(&doc_hash);
    
    if !doc_dir.exists() {
        fs::create_dir_all(&doc_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(doc_dir)
}

fn md5_hash(s: &str) -> u64 {
    let mut hash: u64 = 0;
    for (i, byte) in s.bytes().enumerate() {
        hash = hash.wrapping_add((byte as u64).wrapping_mul((i as u64).wrapping_add(1)));
    }
    hash
}

fn is_pdf2zh_available() -> bool {
    Command::new("pdf2zh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn translate_document(
    input_path: String,
    source_lang: String,
    target_lang: String,
    pages: Option<Vec<i32>>,
) -> Result<TranslateResponse, String> {
    log::info!("[translate_document] Starting translation: {} -> {}", source_lang, target_lang);
    
    // Check if pdf2zh is available
    if !is_pdf2zh_available() {
        return Ok(TranslateResponse {
            success: false,
            output_paths: vec![],
            error: Some("pdf2zh is not installed. Please run: pip install pdf2zh".to_string()),
        });
    }
    
    // Get document-specific cache directory
    let doc_cache_dir = get_doc_cache_dir(&input_path)?;
    log::info!("[translate_document] Cache directory: {:?}", doc_cache_dir);
    
    // Determine pages to translate
    let pages_str = if let Some(ref pages) = pages {
        pages.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",")
    } else {
        "all".to_string()
    };
    
    // Create output filename based on page range
    let output_filename = if let Some(ref pages) = pages {
        if pages.len() == 1 {
            format!("page_{}.pdf", pages[0])
        } else {
            format!("pages_{}.pdf", pages.iter().map(|p| p.to_string()).collect::<Vec<_>>().join("_"))
        }
    } else {
        "full.pdf".to_string()
    };
    
    let output_path = doc_cache_dir.join(&output_filename);
    let output_path_str = output_path.to_string_lossy().to_string();
    
    // Skip if already translated (for single page requests)
    if let Some(ref p) = pages {
        if p.len() == 1 && output_path.exists() {
            log::info!("[translate_document] Using cached translation for page {}", p[0]);
            return Ok(TranslateResponse {
                success: true,
                output_paths: vec![output_path_str],
                error: None,
            });
        }
    }
    
    // Build pdf2zh command
    let mut cmd = Command::new("pdf2zh");
    cmd.arg(&input_path)
        .arg("-li").arg(&source_lang)
        .arg("-lo").arg(&target_lang)
        .arg("-o").arg(&output_path_str);
    
    if let Some(ref pages) = pages {
        cmd.arg("-p").arg(&pages_str);
    }
    
    // Suppress progress output
    cmd.arg("-q");
    
    log::info!("[translate_document] Running: pdf2zh {:?} -li {} -lo {} -o {} -p {}", 
        input_path, source_lang, target_lang, output_path_str, pages_str);
    
    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                log::info!("[translate_document] Translation completed successfully");
                Ok(TranslateResponse {
                    success: true,
                    output_paths: vec![output_path_str],
                    error: None,
                })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::error!("[translate_document] Translation failed: {}", stderr);
                Ok(TranslateResponse {
                    success: false,
                    output_paths: vec![],
                    error: Some(stderr.to_string()),
                })
            }
        }
        Err(e) => {
            log::error!("[translate_document] Failed to run pdf2zh: {}", e);
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some(format!("Failed to run pdf2zh: {}", e)),
            })
        }
    }
}

#[tauri::command]
pub fn get_translation_cache_dir() -> Result<String, String> {
    let cache_dir = get_cache_dir();
    ensure_cache_dir()?;
    Ok(cache_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn clear_translation_cache(doc_path: Option<String>) -> Result<bool, String> {
    let cache_dir = get_cache_dir();
    
    if let Some(path) = doc_path {
        let doc_hash = format!("{:x}", md5_hash(&path));
        let doc_dir = cache_dir.join(&doc_hash);
        if doc_dir.exists() {
            fs::remove_dir_all(&doc_dir).map_err(|e| e.to_string())?;
        }
    } else {
        // Clear all
        if cache_dir.exists() {
            fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(true)
}