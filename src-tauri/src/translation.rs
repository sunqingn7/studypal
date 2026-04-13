use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

// Global state to track the running translation process ID
use lazy_static::lazy_static;
lazy_static! {
    static ref TRANSLATION_PID: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateResponse {
    pub success: bool,
    pub output_paths: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranslationProviderConfig {
    pub service_name: String,      // "openai", "gemini", "ollama", "openailiked"
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub custom_prompt: Option<String>,
    pub venv_path: Option<String>,
    pub threads: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateRequest {
    pub input_path: String,
    pub source_lang: String,
    pub target_lang: String,
    pub pages: Option<Vec<i32>>,
    pub use_llm: bool,
    pub provider_config: Option<TranslationProviderConfig>,
    pub force_retranslate: bool,
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
    let cache_key = format!("{}_{}_{}", doc_path, source_lang, target_lang);
    let doc_hash = format!("{:x}", md5_hash(&cache_key));
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

/// Find cached translation if exists
fn find_cached_translation(
    input_path: &str,
    output_dir: &Path,
) -> Result<Option<String>, String> {
    let input_stem = Path::new(input_path)
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "translated".to_string());
    
    let mono_path = output_dir.join(format!("{}-mono.pdf", input_stem));
    let dual_path = output_dir.join(format!("{}-dual.pdf", input_stem));
    
    if mono_path.exists() {
        Ok(Some(mono_path.to_string_lossy().to_string()))
    } else if dual_path.exists() {
        Ok(Some(dual_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Generate environment variable exports for the script
/// Only exports variables that have values to avoid KeyError in pdf2zh
fn build_env_exports(provider: &TranslationProviderConfig) -> String {
    match provider.service_name.as_str() {
        "openai" => {
            let mut exports = format!(
                r#"export OPENAI_BASE_URL="{base_url}"
export OPENAI_MODEL="{model}""#,
                base_url = provider.base_url.as_deref().unwrap_or("https://api.openai.com/v1"),
                model = provider.model.as_deref().unwrap_or("gpt-4o-mini"),
            );
            // Only export API key if it has a value
            if let Some(ref api_key) = provider.api_key {
                if !api_key.is_empty() {
                    exports.push_str(&format!(r#"
export OPENAI_API_KEY="{}""#, api_key));
                }
            }
            exports
        }
        "gemini" => {
            let mut exports = format!(
                r#"export GEMINI_MODEL="{model}""#,
                model = provider.model.as_deref().unwrap_or("gemini-1.5-flash"),
            );
            // Only export API key if it has a value
            if let Some(ref api_key) = provider.api_key {
                if !api_key.is_empty() {
                    exports.push_str(&format!(r#"
export GEMINI_API_KEY="{}""#, api_key));
                }
            }
            exports
        }
        "ollama" => {
            format!(
                r#"export OLLAMA_HOST="{host}"
export OLLAMA_MODEL="{model}""#,
                host = provider.base_url.as_deref().unwrap_or("http://127.0.0.1:11434"),
                model = provider.model.as_deref().unwrap_or("llama3.2"),
            )
        }
        "openailiked" => {
            let mut exports = String::new();
            // Only export variables that have values
            if let Some(ref base_url) = provider.base_url {
                if !base_url.is_empty() {
                    exports.push_str(&format!(r#"export OPENAILIKED_BASE_URL="{}"
"#, base_url));
                }
            }
            if let Some(ref api_key) = provider.api_key {
                if !api_key.is_empty() {
                    exports.push_str(&format!(r#"export OPENAILIKED_API_KEY="{}"
"#, api_key));
                }
            }
            if let Some(ref model) = provider.model {
                if !model.is_empty() {
                    exports.push_str(&format!(r#"export OPENAILIKED_MODEL="{}"
"#, model));
                }
            }
            exports.trim_end().to_string()
        }
        _ => String::new(),
    }
}

/// Generate Windows batch script
fn generate_windows_script(
    request: &TranslateRequest,
    provider: &TranslationProviderConfig,
    output_dir: &str,
) -> Result<String, String> {
    let env_exports = build_env_exports(provider)
        .replace("export ", "set ")
        .replace("=\"", "=")
        .replace("\"\n", "\n");
    
    let venv_path = provider.venv_path.as_deref().unwrap_or("");
    let service = &provider.service_name;
    let threads = provider.threads;
    
    // Create prompt file if custom prompt is provided
    let prompt_arg = if let Some(ref prompt) = provider.custom_prompt {
        if !prompt.is_empty() {
            // Save prompt to temp file
            let prompt_path = std::env::temp_dir().join(format!("studypal_prompt_{}.txt", std::process::id()));
            let _ = fs::write(&prompt_path, prompt);
            format!("--prompt \"{}\"", prompt_path.to_string_lossy())
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    
    let script = format!(
        r#"@echo off
setlocal enabledelayedexpansion

REM Source venv if exists
if exist "{venv_path}\Scripts\activate.bat" (
    call "{venv_path}\Scripts\activate.bat"
)

REM Set environment variables
{env_exports}

REM Run pdf2zh
pdf2zh "{input_path}" ^
    -li "{source_lang}" ^
    -lo "{target_lang}" ^
    -s "{service}" ^
    -t {threads} ^
    -o "{output_dir}" ^
    {prompt_arg}
"#,
        venv_path = venv_path,
        env_exports = env_exports,
        input_path = request.input_path,
        source_lang = request.source_lang,
        target_lang = request.target_lang,
        service = service,
        threads = threads,
        output_dir = output_dir,
        prompt_arg = prompt_arg,
    );
    
    Ok(script)
}

/// Generate Unix shell script
fn generate_unix_script(
    request: &TranslateRequest,
    provider: &TranslationProviderConfig,
    output_dir: &str,
) -> Result<String, String> {
    let env_exports = build_env_exports(provider);
    let venv_path = provider.venv_path.as_deref().unwrap_or("");
    let service = &provider.service_name;
    let threads = provider.threads;
    
    // Create prompt file if custom prompt is provided
    let prompt_arg = if let Some(ref prompt) = provider.custom_prompt {
        if !prompt.is_empty() {
            // Save prompt to temp file
            let prompt_path = std::env::temp_dir().join(format!("studypal_prompt_{}.txt", std::process::id()));
            let _ = fs::write(&prompt_path, prompt);
            format!("--prompt '{}'", prompt_path.to_string_lossy())
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    
    let script = format!(
        r#"#!/bin/bash
set -e

VENV_PATH="{venv_path}"
if [ -n "$VENV_PATH" ] && [ -f "$VENV_PATH/bin/activate" ]; then
  source "$VENV_PATH/bin/activate"
fi

{env_exports}

# Use exec to replace bash with pdf2zh so killing this process kills pdf2zh directly
exec pdf2zh "{input_path}" \
  -li "{source_lang}" \
  -lo "{target_lang}" \
  -s "{service}" \
  -t {threads} \
  -o "{output_dir}" \
  {prompt_arg}
"#,
        venv_path = venv_path,
        env_exports = env_exports,
        input_path = request.input_path,
        source_lang = request.source_lang,
        target_lang = request.target_lang,
        service = service,
        threads = threads,
        output_dir = output_dir,
        prompt_arg = prompt_arg,
    );
    
    Ok(script)
}

/// Generate and save translation script
fn generate_script(
    request: &TranslateRequest,
    provider: &TranslationProviderConfig,
    output_dir: &str,
) -> Result<PathBuf, String> {
    // Generate script content
    let script_content = if cfg!(windows) {
        generate_windows_script(request, provider, output_dir)?
    } else {
        generate_unix_script(request, provider, output_dir)?
    };
    
    // Write script to temp file
    let extension = if cfg!(windows) { ".bat" } else { ".sh" };
    let script_path = std::env::temp_dir().join(format!("studypal_translate_{}{}", std::process::id(), extension));
    fs::write(&script_path, script_content).map_err(|e| e.to_string())?;
    
    // Set permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        fs::set_permissions(&script_path, perms).map_err(|e| e.to_string())?;
    }
    
    Ok(script_path)
}

/// Translate using LLM provider
async fn translate_with_llm(
    request: &TranslateRequest,
    provider: &TranslationProviderConfig,
    output_dir: &str,
) -> Result<TranslateResponse, String> {
    log::info!(
        "[translate_with_llm] Using service: {}, threads: {}",
        provider.service_name, provider.threads
    );

    // Generate script
    let script_path = generate_script(request, provider, output_dir)?;

    // Execute script using tokio::process to allow cancellation
    let mut child = if cfg!(windows) {
        tokio::process::Command::new("cmd")
            .arg("/C")
            .arg(&script_path)
            .spawn()
    } else {
        tokio::process::Command::new("bash")
            .arg(&script_path)
            .spawn()
    }
    .map_err(|e| format!("Failed to execute script: {}", e))?;

    // Store the process ID globally so it can be stopped
    {
        let mut pid_guard = TRANSLATION_PID.lock().await;
        *pid_guard = child.id();
    }

    // Wait for completion
    let result = async {
        tokio::time::timeout(
            tokio::time::Duration::from_secs(3600), // 1 hour timeout
            async {
                let status = child.wait().await;
                status
            }
        ).await
    }.await;

    // Clear the process ID
    {
        let mut pid_guard = TRANSLATION_PID.lock().await;
        *pid_guard = None;
    }

    // Cleanup script
    let _ = fs::remove_file(&script_path);
    // Cleanup prompt file if exists
    let prompt_file = std::env::temp_dir().join(format!("studypal_prompt_{}.txt", std::process::id()));
    let _ = fs::remove_file(&prompt_file);

    // Check result
    match result {
        Ok(Ok(status)) if status.success() => {
            if let Some(translated_path) = find_cached_translation(&request.input_path, Path::new(output_dir))? {
                log::info!("[translate_with_llm] Translation completed: {}", translated_path);
                Ok(TranslateResponse {
                    success: true,
                    output_paths: vec![translated_path],
                    error: None,
                })
            } else {
                Ok(TranslateResponse {
                    success: false,
                    output_paths: vec![],
                    error: Some("Translation completed but output file not found".to_string()),
                })
            }
        }
        Ok(Ok(status)) => {
            // Process completed but failed
            log::error!("[translate_with_llm] Translation failed with exit code: {:?}", status.code());
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some(format!("Translation failed with exit code: {:?}", status.code())),
            })
        }
        Ok(Err(e)) => {
            log::error!("[translate_with_llm] Failed to wait for process: {}", e);
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some(format!("Failed to wait for process: {}", e)),
            })
        }
        Err(_) => {
            // Timeout
            log::error!("[translate_with_llm] Translation timed out");
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some("Translation timed out (1 hour)".to_string()),
            })
        }
    }
}

/// Translate using Google (pdf2zh default)
async fn translate_with_google(
    request: &TranslateRequest,
    output_dir: &str,
) -> Result<TranslateResponse, String> {
    log::info!("[translate_with_google] Using Google Translate");

    // Start the translation process
    let mut child = tokio::process::Command::new("pdf2zh")
        .arg(&request.input_path)
        .arg("-li").arg(&request.source_lang)
        .arg("-lo").arg(&request.target_lang)
        .arg("-s").arg("google")
        .arg("-o").arg(output_dir)
        .spawn()
        .map_err(|e| format!("Failed to run pdf2zh: {}", e))?;

    // Store the process ID globally so it can be stopped
    {
        let mut pid_guard = TRANSLATION_PID.lock().await;
        *pid_guard = child.id();
    }

    // Wait for completion with timeout
    let result = async {
        tokio::time::timeout(
            tokio::time::Duration::from_secs(3600), // 1 hour timeout
            async {
                let status = child.wait().await;
                status
            }
        ).await
    }.await;

    // Clear the process ID
    {
        let mut pid_guard = TRANSLATION_PID.lock().await;
        *pid_guard = None;
    }

    // Check result
    match result {
        Ok(Ok(status)) if status.success() => {
            if let Some(translated_path) = find_cached_translation(&request.input_path, Path::new(output_dir))? {
                log::info!("[translate_with_google] Translation completed: {}", translated_path);
                Ok(TranslateResponse {
                    success: true,
                    output_paths: vec![translated_path],
                    error: None,
                })
            } else {
                Ok(TranslateResponse {
                    success: false,
                    output_paths: vec![],
                    error: Some("Translation completed but output file not found".to_string()),
                })
            }
        }
        Ok(Ok(status)) => {
            log::error!("[translate_with_google] Translation failed with exit code: {:?}", status.code());
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some(format!("Translation failed with exit code: {:?}", status.code())),
            })
        }
        Ok(Err(e)) => {
            log::error!("[translate_with_google] Failed to wait for process: {}", e);
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some(format!("Failed to wait for process: {}", e)),
            })
        }
        Err(_) => {
            log::error!("[translate_with_google] Translation timed out");
            Ok(TranslateResponse {
                success: false,
                output_paths: vec![],
                error: Some("Translation timed out (1 hour)".to_string()),
            })
        }
    }
}

/// Main translation command with LLM support
#[tauri::command]
pub async fn translate_document(
    request: TranslateRequest,
) -> Result<TranslateResponse, String> {
    log::info!(
        "[translate_document] Starting translation: {} -> {} (use_llm: {}, force: {})",
        request.source_lang,
        request.target_lang,
        request.use_llm,
        request.force_retranslate
    );
    
    // Check if pdf2zh is available
    if !is_pdf2zh_available() {
        return Ok(TranslateResponse {
            success: false,
            output_paths: vec![],
            error: Some("pdf2zh is not installed. Please run: pip install pdf2zh".to_string()),
        });
    }
    
    // Get document-specific cache directory
    let doc_cache_dir = get_doc_cache_dir(
        &request.input_path,
        &request.source_lang,
        &request.target_lang,
    )?;
    let output_dir = doc_cache_dir.to_string_lossy().to_string();
    
    // Clear cache if force retranslate
    if request.force_retranslate {
        let _ = fs::remove_dir_all(&doc_cache_dir);
        let _ = fs::create_dir_all(&doc_cache_dir);
    }
    
    // Check for cached translation
    if let Some(cached_path) = find_cached_translation(&request.input_path, &doc_cache_dir)? {
        if !request.force_retranslate {
            log::info!("[translate_document] Using cached translation: {}", cached_path);
            return Ok(TranslateResponse {
                success: true,
                output_paths: vec![cached_path],
                error: None,
            });
        }
    }
    
    // Determine service to use
    let result = if request.use_llm {
        if let Some(ref provider_config) = request.provider_config {
            // Use LLM translation
            translate_with_llm(&request, provider_config, &output_dir).await
        } else {
            // No provider config, use Google
            translate_with_google(&request, &output_dir).await
        }
    } else {
        // Use Google translation
        translate_with_google(&request, &output_dir).await
    };
    
    result
}

/// Stop running translation
#[tauri::command]
pub async fn stop_translation() -> Result<bool, String> {
    let mut pid_guard = TRANSLATION_PID.lock().await;

    if let Some(pid) = *pid_guard {
        log::info!("[stop_translation] Attempting to stop translation process with PID: {}", pid);

        #[cfg(unix)]
        {
            // On Unix, try to kill the process using kill -9 (SIGKILL) for forceful termination
            // SIGTERM might be ignored by child processes, SIGKILL cannot be caught or ignored
            use std::process::Command;
            
            // Kill the main process with SIGKILL
            let _ = Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .output();
            
            // Also kill any child processes (pdf2zh spawns python processes)
            // Kill all processes in the process group
            let _ = Command::new("kill")
                .arg("-9")
                .arg("-").arg(pid.to_string())  // Negative PID kills process group
                .output();
            
            // Wait a moment for processes to die
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            // Find and kill any child processes of the main PID
            let pgrep_output = Command::new("pgrep")
                .arg("-P")
                .arg(pid.to_string())
                .output();
            
            if let Ok(result) = pgrep_output {
                let child_pids = String::from_utf8_lossy(&result.stdout);
                for child_pid in child_pids.lines() {
                    if let Ok(_cpid) = child_pid.parse::<u32>() {
                        let _ = Command::new("kill")
                            .arg("-9")
                            .arg(child_pid)
                            .output();
                        log::info!("[stop_translation] Killed child process: {}", child_pid);
                    }
                }
            }
            
            // Kill any process that has the parent PID in its process tree
            // This catches processes started by the bash script
            let _ = Command::new("sh")
                .arg("-c")
                .arg(format!(r#"pgrep -f "pdf2zh" | while read p; do if ps -p {} -o pid= > /dev/null 2>&1 || ps -p $p -o ppid= | grep -q "{}"; then kill -9 $p 2>/dev/null; fi; done"#, pid, pid))
                .output();
            
            // Also try to kill any lingering pdf2zh or python processes
            // Try multiple patterns to catch different ways the process might appear
            for pattern in &["pdf2zh", "pdf2zh.py", "python.*pdf2zh"] {
                let _ = Command::new("pkill")
                    .arg("-9")
                    .arg("-f")
                    .arg(pattern)
                    .output();
            }
            
            // Also kill any python processes that might be running the translation
            let _ = Command::new("pkill")
                .arg("-9")
                .arg("-f")
                .arg("python.*translate")
                .output();
            
            // Final cleanup: kill any process that has the script file open
            let _ = Command::new("sh")
                .arg("-c")
                .arg(r#"lsof +D /tmp | grep studypal_translate | awk '{print $2}' | xargs -r kill -9 2>/dev/null"#)
                .output();
            
            log::info!("[stop_translation] Translation process and children killed");
            *pid_guard = None;
            Ok(true)
        }

        #[cfg(windows)]
        {
            // On Windows, use taskkill
            use std::process::Command;
            let output = Command::new("taskkill")
                .arg("/F")
                .arg("/T")
                .arg("/PID")
                .arg(pid.to_string())
                .output();
            
            match output {
                Ok(_) => {
                    log::info!("[stop_translation] Translation process stopped successfully");
                    *pid_guard = None;
                    Ok(true)
                }
                Err(e) => {
                    log::error!("[stop_translation] Failed to kill process: {}", e);
                    *pid_guard = None;
                    Ok(false)
                }
            }
        }
    } else {
        log::info!("[stop_translation] No translation process running");
        Ok(false)
    }
}

/// Clear translation cache
#[tauri::command]
pub async fn clear_translation_cache(
    doc_path: Option<String>,
    source_lang: Option<String>,
    target_lang: Option<String>,
) -> Result<bool, String> {
    if let (Some(path), Some(src), Some(tgt)) = (doc_path, source_lang, target_lang) {
        // Clear specific document
        let cache_dir = get_cache_dir();
        let cache_key = format!("{}_{}_{}", path, src, tgt);
        let doc_hash = format!("{:x}", md5_hash(&cache_key));
        let doc_dir = cache_dir.join(&doc_hash);
        
        if doc_dir.exists() {
            fs::remove_dir_all(&doc_dir).map_err(|e| e.to_string())?;
        }
        Ok(true)
    } else {
        // Clear all
        let cache_dir = get_cache_dir();
        if cache_dir.exists() {
            fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        }
        Ok(true)
    }
}
