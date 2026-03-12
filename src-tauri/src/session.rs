use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub provider: String,
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
}

impl Default for AIConfig {
    fn default() -> Self {
        AIConfig {
            provider: "llamacpp".to_string(),
            endpoint: "http://192.168.1.67:8033".to_string(),
            model: "Qwen3.5-27B".to_string(),
            api_key: None,
            system_prompt: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePosition {
    pub path: String,
    pub page: u32,
    pub scroll_position: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub ai_config: AIConfig,
    pub provider_configs: Option<serde_json::Map<String, serde_json::Value>>,
    pub open_files: Vec<FilePosition>,
    pub active_file: Option<String>,
}

impl Default for SessionState {
    fn default() -> Self {
        SessionState {
            ai_config: AIConfig::default(),
            provider_configs: None,
            open_files: Vec::new(),
            active_file: None,
        }
    }
}

fn get_config_dir() -> Option<PathBuf> {
    if let Some(config_dir) = dirs::config_dir() {
        let studypal_config = config_dir.join("studypal");
        return Some(studypal_config);
    }
    None
}

fn ensure_config_dir() -> Result<PathBuf, String> {
    let config_dir =
        get_config_dir().ok_or_else(|| "Failed to get config directory".to_string())?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(config_dir)
}

fn get_session_file_path() -> Result<PathBuf, String> {
    let config_dir = ensure_config_dir()?;
    Ok(config_dir.join("session.json"))
}

#[tauri::command]
pub fn load_session() -> Result<SessionState, String> {
    let session_path = get_session_file_path()?;

    if !session_path.exists() {
        return Ok(SessionState::default());
    }

    let content = fs::read_to_string(&session_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let session: SessionState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session file: {}", e))?;

    Ok(session)
}

#[tauri::command]
pub fn save_session(session: SessionState) -> Result<(), String> {
    let session_path = get_session_file_path()?;

    let content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&session_path, content)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    Ok(())
}
