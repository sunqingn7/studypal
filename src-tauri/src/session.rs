use crate::database::{self, ChatTab, DocumentMetadata, Note, NoteTab};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// Initialize database on demand - we'll create a new connection each time for simplicity
// In a production app, you might want to use a connection pool
fn get_database() -> database::Database {
    database::Database::new().expect("Failed to initialize database")
}

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

// Chat operations using database
#[tauri::command]
pub fn save_chats(document_path: String, tabs: Vec<ChatTab>) -> Result<(), String> {
    get_database()
        .save_chats(&document_path, &tabs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_chats(document_path: String) -> Result<Vec<ChatTab>, String> {
    get_database()
        .load_chats(&document_path)
        .map_err(|e| e.to_string())
}

// Note operations using database
#[tauri::command]
pub fn save_notes(document_path: String, notes: Vec<Note>) -> Result<(), String> {
    get_database()
        .save_notes(&document_path, &notes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_notes(document_path: String) -> Result<Vec<Note>, String> {
    get_database()
        .load_notes(&document_path)
        .map_err(|e| e.to_string())
}

// Note tabs operations using database
#[tauri::command]
pub fn save_note_tabs(document_path: String, tabs: Vec<NoteTab>) -> Result<(), String> {
    get_database()
        .save_note_tabs(&document_path, &tabs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_note_tabs(document_path: String) -> Result<Vec<NoteTab>, String> {
    get_database()
        .load_note_tabs(&document_path)
        .map_err(|e| e.to_string())
}

// Delete document data
#[tauri::command]
pub fn delete_document_data(document_path: String) -> Result<(), String> {
    get_database()
        .delete_document_data(&document_path)
        .map_err(|e| e.to_string())
}

// Markdown note operations
#[tauri::command]
pub fn save_note_as_markdown(
    document_path: String,
    note_id: String,
    title: String,
    content: String,
    note_type: String,
    topic_id: Option<String>,
    created_at: i64,
    updated_at: i64,
) -> Result<(), String> {
    let note = Note {
        id: note_id,
        title,
        content,
        note_type,
        topic_id,
        created_at,
        updated_at,
    };
    get_database()
        .save_note_as_markdown(&note, &document_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_note_from_markdown(
    document_path: String,
    note_id: String,
) -> Result<Option<Note>, String> {
    get_database()
        .load_note_from_markdown(&document_path, &note_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_all_notes_from_markdown(document_path: String) -> Result<Vec<Note>, String> {
    get_database()
        .load_all_notes_from_markdown(&document_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note_markdown(document_path: String, note_id: String) -> Result<(), String> {
    get_database()
        .delete_note_markdown(&document_path, &note_id)
        .map_err(|e| e.to_string())
}

// Document metadata operations
#[tauri::command]
pub fn save_document_metadata(metadata: DocumentMetadata) -> Result<(), String> {
    println!(
        "[Rust] save_document_metadata called for: {}, page: {}",
        metadata.document_path, metadata.current_page
    );
    let result = get_database().save_document_metadata(&metadata);
    match &result {
        Ok(_) => println!("[Rust] Successfully saved metadata"),
        Err(e) => println!("[Rust] Error saving metadata: {:?}", e),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_document_metadata(document_path: String) -> Result<Option<DocumentMetadata>, String> {
    println!(
        "[Rust] load_document_metadata called for: {}",
        document_path
    );
    let result = get_database().load_document_metadata(&document_path);
    match &result {
        Ok(Some(m)) => println!("[Rust] Found metadata: current_page={}", m.current_page),
        Ok(None) => println!("[Rust] No metadata found"),
        Err(e) => println!("[Rust] Error: {:?}", e),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_document_with_context(document_path: String) -> Result<serde_json::Value, String> {
    get_database()
        .get_document_with_context(&document_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn debug_list_all_metadata() -> Result<serde_json::Value, String> {
    let all = get_database()
        .debug_list_all_metadata()
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!(all))
}

#[tauri::command]
pub fn debug_list_all_chats() -> Result<serde_json::Value, String> {
    let all = get_database()
        .debug_list_all_chats()
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!(all))
}
