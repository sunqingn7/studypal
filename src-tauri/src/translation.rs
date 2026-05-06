use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::fs;

// Note: TranslateRequest is kept for future API compatibility

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

fn get_doc_cache_dir(doc_path: &str, source_lang: &str, target_lang: &str) -> Result<PathBuf, String> {
    let cache_dir = ensure_cache_dir()?;
    
    // Create hash from document path + language pair
    let cache_key = format!("{}_{}_{}", doc_path, source_lang, target_lang);
    let doc_hash = format!("{:x}", md5_hash(&cache_key));
    let doc_dir = cache_dir.join(&doc_hash);
    
    if !doc_dir.exists() {
        fs::create_dir_all(&doc_dir).map_err(|e| e.to_string())?;
    }
    
    log::info!("[translate_document] Doc cache dir: {:?}", doc_dir);
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
    _pages: Option<Vec<i32>>,
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
    
    // Get document-specific cache directory (includes language pair in key)
    let doc_cache_dir = get_doc_cache_dir(&input_path, &source_lang, &target_lang)?;
    log::info!("[translate_document] Cache directory: {:?}", doc_cache_dir);
    
    // Create output directory based on document hash
    // Note: pdf2zh -o expects a DIRECTORY, not a file
    let output_dir = doc_cache_dir.clone();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    
    // Check if full translation already exists
    // pdf2zh outputs: originalname-dual.pdf and originalname-mono.pdf
    let input_stem = std::path::Path::new(&input_path)
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "translated".to_string());
    
    // Check for both dual and mono versions - prefer mono
    let mono_path = output_dir.join(format!("{}-mono.pdf", input_stem));
    let dual_path = output_dir.join(format!("{}-dual.pdf", input_stem));
    
    let translated_path = if mono_path.exists() {
        mono_path.clone()
    } else if dual_path.exists() {
        dual_path.clone()
    } else {
        // No cached translation found, need to translate
        log::info!("[translate_document] No cached translation found, translating...");
        
        // Build pdf2zh command - translate entire document
        let mut cmd = Command::new("pdf2zh");
        cmd.arg(&input_path)
            .arg("-li").arg(&source_lang)
            .arg("-lo").arg(&target_lang)
            .arg("-o").arg(&output_dir_str);
        
        log::info!("[translate_document] Running: pdf2zh {:?} -li {} -lo {} -o {}", 
            input_path, source_lang, target_lang, output_dir_str);
        
        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!("[translate_document] Translation completed successfully");
                    
                    // Try to find the output file - prefer mono, then dual
                    if mono_path.exists() {
                        mono_path.clone()
                    } else if dual_path.exists() {
                        dual_path.clone()
                    } else {
                        return Ok(TranslateResponse {
                            success: false,
                            output_paths: vec![],
                            error: Some("Translation completed but output file not found".to_string()),
                        });
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::error!("[translate_document] Translation failed: {}", stderr);
                    return Ok(TranslateResponse {
                        success: false,
                        output_paths: vec![],
                        error: Some(stderr.to_string()),
                    });
                }
            }
            Err(e) => {
                log::error!("[translate_document] Failed to run pdf2zh: {}", e);
                return Ok(TranslateResponse {
                    success: false,
                    output_paths: vec![],
                    error: Some(format!("Failed to run pdf2zh: {}", e)),
                });
            }
        }
    };
    
    let translated_path_str = translated_path.to_string_lossy().to_string();
    log::info!("[translate_document] Translated PDF at: {}", translated_path_str);
    
    Ok(TranslateResponse {
        success: true,
        output_paths: vec![translated_path_str],
        error: None,
    })
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