use rusqlite::{Connection, Result};
use std::fs;
use std::path::Path;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub thinking: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTab {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(rename = "noteType")]
    pub note_type: String,
    #[serde(rename = "topicId")]
    pub topic_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTab {
    pub id: String,
    #[serde(rename = "noteId")]
    pub note_id: String,
    pub title: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct DocumentMetadata {
    pub id: String,
    pub document_path: String,
    pub chat_id: Option<String>,
    pub view_mode: String, // 'single' | 'double'
    pub scale: f64,
    pub current_page: i32,
    pub scroll_position: f64,
    pub settings_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| rusqlite::Error::InvalidPath("Failed to get config dir".into()))?
            .join("studypal");

        // Create config directory if it doesn't exist
        std::fs::create_dir_all(&config_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to create config dir: {}", e).into())
        })?;

        let db_path = config_dir.join("studypal.db");
        let conn = Connection::open(db_path)?;

        // Initialize tables
        Self::init_tables(&conn)?;

        Ok(Database { connection: conn })
    }

    fn init_tables(conn: &Connection) -> Result<()> {
        // Create chats table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                document_path TEXT NOT NULL,
                tabs TEXT NOT NULL
            )",
            [],
        )?;

        // Create notes table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                document_path TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                note_type TEXT NOT NULL,
                topic_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;

        // Create note tabs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS note_tabs (
                id TEXT PRIMARY KEY,
                document_path TEXT NOT NULL,
                note_id TEXT NOT NULL,
                title TEXT NOT NULL,
                is_active BOOLEAN NOT NULL
            )",
            [],
        )?;

        // Create indices for better performance
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chats_document_path ON chats(document_path)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_notes_document_path ON notes(document_path)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_note_tabs_document_path ON note_tabs(document_path)",
            [],
        )?;

        // Create document_metadata table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS document_metadata (
            id TEXT PRIMARY KEY,
            document_path TEXT NOT NULL UNIQUE,
            chat_id TEXT,
            view_mode TEXT DEFAULT 'single',
            scale REAL DEFAULT 1.0,
            current_page INTEGER DEFAULT 1,
            scroll_position REAL DEFAULT 0.0,
            settings_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
            [],
        )?;

        // Create indices for document_metadata
        conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metadata_document_path ON document_metadata(document_path)",
        [],
    )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_metadata_chat_id ON document_metadata(chat_id)",
            [],
        )?;

        Ok(())
    }

    // Chat operations
    pub fn save_chats(&self, document_path: &str, tabs: &[ChatTab]) -> Result<()> {
        let tabs_json = serde_json::to_string(tabs)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        self.connection.execute(
            "INSERT OR REPLACE INTO chats (id, document_path, tabs) VALUES (?, ?, ?)",
            (document_path, document_path, &tabs_json),
        )?;

        Ok(())
    }

    pub fn load_chats(&self, document_path: &str) -> Result<Vec<ChatTab>> {
        let mut stmt = self
            .connection
            .prepare("SELECT tabs FROM chats WHERE document_path = ?")?;

        let tabs_json = stmt.query_row([document_path], |row| row.get::<_, String>(0))?;

        let tabs: Vec<ChatTab> = serde_json::from_str(&tabs_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        Ok(tabs)
    }

    // Note operations
    pub fn save_notes(&self, document_path: &str, notes: &[Note]) -> Result<()> {
        self.connection
            .execute("DELETE FROM notes WHERE document_path = ?", [document_path])?;

        let mut stmt = self.connection.prepare(
            "INSERT INTO notes (id, document_path, title, content, note_type, topic_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )?;

        for note in notes {
            stmt.execute(rusqlite::params![
                note.id,
                document_path,
                note.title,
                note.content,
                note.note_type,
                note.topic_id,
                note.created_at,
                note.updated_at,
            ])?;
        }

        Ok(())
    }

    pub fn load_notes(&self, document_path: &str) -> Result<Vec<Note>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, title, content, note_type, topic_id, created_at, updated_at 
             FROM notes WHERE document_path = ?",
        )?;

        let note_iter = stmt.query_map([document_path], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                note_type: row.get(3)?,
                topic_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut notes = Vec::new();
        for note in note_iter {
            notes.push(note?);
        }

        Ok(notes)
    }

    // Note tabs operations
    pub fn save_note_tabs(&self, document_path: &str, tabs: &[NoteTab]) -> Result<()> {
        self.connection.execute(
            "DELETE FROM note_tabs WHERE document_path = ?",
            [document_path],
        )?;

        let mut stmt = self.connection.prepare(
            "INSERT INTO note_tabs (id, document_path, note_id, title, is_active)
             VALUES (?, ?, ?, ?, ?)",
        )?;

        for tab in tabs {
            stmt.execute(rusqlite::params![
                tab.id,
                document_path,
                tab.note_id,
                tab.title,
                tab.is_active,
            ])?;
        }

        Ok(())
    }

    pub fn load_note_tabs(&self, document_path: &str) -> Result<Vec<NoteTab>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, note_id, title, is_active FROM note_tabs WHERE document_path = ?",
        )?;

        let tab_iter = stmt.query_map([document_path], |row| {
            Ok(NoteTab {
                id: row.get(0)?,
                note_id: row.get(1)?,
                title: row.get(2)?,
                is_active: row.get::<_, bool>(3)?,
            })
        })?;

        let mut tabs = Vec::new();
        for tab in tab_iter {
            tabs.push(tab?);
        }

        Ok(tabs)
    }

    // Utility functions
    pub fn delete_document_data(&self, document_path: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM chats WHERE document_path = ?", [document_path])?;

        self.connection
            .execute("DELETE FROM notes WHERE document_path = ?", [document_path])?;

        self.connection.execute(
            "DELETE FROM note_tabs WHERE document_path = ?",
            [document_path],
        )?;

        Ok(())
    }

    // Markdown notes operations
    pub fn save_note_as_markdown(&self, note: &Note, document_path: &str) -> Result<()> {
        // Create StudyNotes directory in the same folder as the document
        let doc_path = Path::new(document_path);
        let doc_name = doc_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed");

        // Create subfolder structure: StudyNotes/<document_name>/
        let study_notes_dir = doc_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("StudyNotes")
            .join(doc_name);

        // Create directory if it doesn't exist
        fs::create_dir_all(&study_notes_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to create StudyNotes dir: {}", e).into())
        })?;

        // Create safe filename from note title (tab title from frontend)
        let safe_title = note
            .title
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect::<String>();

        let file_name = format!("{}.md", safe_title);
        let file_path = study_notes_dir.join(file_name);

        // Create markdown content
        let markdown_content = format!(
            "---\nid: {}\ntype: {}\ntopic_id: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n{}",
            note.id,
            note.note_type,
            note.topic_id.as_deref().unwrap_or(""),
            note.created_at,
            note.updated_at,
            note.content
        );

        // Write to file
        fs::write(&file_path, markdown_content).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to write note file: {}", e).into())
        })?;

        Ok(())
    }

    pub fn load_note_from_markdown(
        &self,
        document_path: &str,
        note_id: &str,
    ) -> Result<Option<Note>> {
        // Look for markdown file in StudyNotes/<document_name>/ directory
        let doc_path = Path::new(document_path);
        let doc_name = doc_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed");

        let study_notes_dir = doc_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("StudyNotes")
            .join(doc_name);

        if !study_notes_dir.exists() {
            return Ok(None);
        }

        // Look for files that might contain this note ID
        let entries = fs::read_dir(&study_notes_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to read StudyNotes dir: {}", e).into())
        })?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    let content = fs::read_to_string(&path).map_err(|e| {
                        rusqlite::Error::InvalidPath(
                            format!("Failed to read note file: {}", e).into(),
                        )
                    })?;

                    // Parse frontmatter to get ID
                    if let Some(frontmatter_end) = content.find("\n---\n") {
                        if let Some(frontmatter_start) = content.find("---\n") {
                            let frontmatter = &content[frontmatter_start + 4..frontmatter_end];
                            for line in frontmatter.lines() {
                                if line.starts_with("id: ") {
                                    let id = line[4..].trim();
                                    if id == note_id {
                                        // Extract content (everything after the second ---)
                                        let content_start = frontmatter_end + 5;
                                        let note_content = &content[content_start..];

                                        // Parse other fields from frontmatter
                                        let mut note_type = "note".to_string();
                                        let mut topic_id = None;
                                        let mut created_at = 0;
                                        let mut updated_at = 0;

                                        for line in frontmatter.lines() {
                                            if line.starts_with("type: ") {
                                                note_type = line[6..].trim().to_string();
                                            } else if line.starts_with("topic_id: ") {
                                                let tid = line[10..].trim();
                                                if !tid.is_empty() {
                                                    topic_id = Some(tid.to_string());
                                                }
                                            } else if line.starts_with("created_at: ") {
                                                created_at = line[12..].trim().parse().unwrap_or(0);
                                            } else if line.starts_with("updated_at: ") {
                                                updated_at = line[12..].trim().parse().unwrap_or(0);
                                            }
                                        }

                                        return Ok(Some(Note {
                                            id: note_id.to_string(),
                                            title: path
                                                .file_stem()
                                                .and_then(|s| s.to_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            content: note_content.to_string(),
                                            note_type,
                                            topic_id,
                                            created_at,
                                            updated_at,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    pub fn load_all_notes_from_markdown(&self, document_path: &str) -> Result<Vec<Note>> {
        let mut notes = Vec::new();

        // Look for markdown files in StudyNotes/<document_name>/ directory
        let doc_path = Path::new(document_path);
        let doc_name = doc_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed");

        let study_notes_dir = doc_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("StudyNotes")
            .join(doc_name);

        if !study_notes_dir.exists() {
            return Ok(notes);
        }

        let entries = fs::read_dir(&study_notes_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to read StudyNotes dir: {}", e).into())
        })?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();

                if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    let content = fs::read_to_string(&path).map_err(|e| {
                        rusqlite::Error::InvalidPath(
                            format!("Failed to read note file: {}", e).into(),
                        )
                    })?;

                    // Parse frontmatter to get ID
                    if let Some(frontmatter_end) = content.find("\n---\n") {
                        if let Some(frontmatter_start) = content.find("---\n") {
                            let frontmatter = &content[frontmatter_start + 4..frontmatter_end];

                            // Extract ID
                            let mut id = None;
                            let mut note_type = "note".to_string();
                            let mut topic_id = None;
                            let mut created_at = 0;
                            let mut updated_at = 0;

                            for line in frontmatter.lines() {
                                if line.starts_with("id: ") {
                                    id = Some(line[4..].trim().to_string());
                                } else if line.starts_with("type: ") {
                                    note_type = line[6..].trim().to_string();
                                } else if line.starts_with("topic_id: ") {
                                    let tid = line[10..].trim();
                                    if !tid.is_empty() {
                                        topic_id = Some(tid.to_string());
                                    }
                                } else if line.starts_with("created_at: ") {
                                    created_at = line[12..].trim().parse().unwrap_or(0);
                                } else if line.starts_with("updated_at: ") {
                                    updated_at = line[12..].trim().parse().unwrap_or(0);
                                }
                            }

                            if let Some(id) = id {
                                // Extract content (everything after the second ---)
                                let content_start = frontmatter_end + 5;
                                let note_content = &content[content_start..];

                                notes.push(Note {
                                    id,
                                    title: path
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    content: note_content.to_string(),
                                    note_type,
                                    topic_id,
                                    created_at,
                                    updated_at,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(notes)
    }

    pub fn delete_note_markdown(&self, document_path: &str, note_id: &str) -> Result<()> {
        // Look for markdown file in StudyNotes/<document_name>/ directory
        let doc_path = Path::new(document_path);
        let doc_name = doc_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed");

        let study_notes_dir = doc_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("StudyNotes")
            .join(doc_name);

        if !study_notes_dir.exists() {
            return Ok(());
        }

        // Look for files that might contain this note ID
        let entries = fs::read_dir(&study_notes_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("Failed to read StudyNotes dir: {}", e).into())
        })?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    let content = fs::read_to_string(&path).map_err(|e| {
                        rusqlite::Error::InvalidPath(
                            format!("Failed to read note file: {}", e).into(),
                        )
                    })?;

                    // Parse frontmatter to get ID
                    if let Some(frontmatter_end) = content.find("\n---\n") {
                        if let Some(frontmatter_start) = content.find("---\n") {
                            let frontmatter = &content[frontmatter_start + 4..frontmatter_end];
                            for line in frontmatter.lines() {
                                if line.starts_with("id: ") {
                                    let id = line[4..].trim();
                                    if id == note_id {
                                        // Delete the file
                                        fs::remove_file(&path).map_err(|e| {
                                            rusqlite::Error::InvalidPath(
                                                format!("Failed to delete note file: {}", e).into(),
                                            )
                                        })?;
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    // Document metadata operations
    pub fn save_document_metadata(&self, metadata: &DocumentMetadata) -> Result<()> {
        println!(
            "[DB] save_document_metadata: id={}, path={}, page={}, view_mode={}, scale={}",
            metadata.id,
            metadata.document_path,
            metadata.current_page,
            metadata.view_mode,
            metadata.scale
        );

        let rows_affected = self.connection.execute(
            "INSERT OR REPLACE INTO document_metadata 
             (id, document_path, chat_id, view_mode, scale, current_page, scroll_position, settings_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                metadata.id,
                metadata.document_path,
                metadata.chat_id,
                metadata.view_mode,
                metadata.scale,
                metadata.current_page,
                metadata.scroll_position,
                metadata.settings_json,
                metadata.created_at,
                metadata.updated_at,
            ],
        )?;

        println!(
            "[DB] save_document_metadata: rows_affected={}",
            rows_affected
        );
        Ok(())
    }

    pub fn load_document_metadata(&self, document_path: &str) -> Result<Option<DocumentMetadata>> {
        println!(
            "[DB] load_document_metadata: looking for path={}",
            document_path
        );

        let mut stmt = self.connection.prepare(
            "SELECT id, document_path, chat_id, view_mode, scale, current_page, scroll_position, settings_json, created_at, updated_at
             FROM document_metadata WHERE document_path = ?"
        )?;

        let result = stmt.query_row([document_path], |row| {
            Ok(DocumentMetadata {
                id: row.get(0)?,
                document_path: row.get(1)?,
                chat_id: row.get(2)?,
                view_mode: row.get(3)?,
                scale: row.get(4)?,
                current_page: row.get(5)?,
                scroll_position: row.get(6)?,
                settings_json: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        });

        match result {
            Ok(metadata) => {
                println!(
                    "[DB] load_document_metadata: FOUND - page={}, view_mode={}",
                    metadata.current_page, metadata.view_mode
                );
                Ok(Some(metadata))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                println!(
                    "[DB] load_document_metadata: NO ROWS FOUND for path={}",
                    document_path
                );
                Ok(None)
            }
            Err(e) => {
                println!("[DB] load_document_metadata: ERROR={:?}", e);
                Err(e)
            }
        }
    }

    pub fn get_document_with_context(&self, document_path: &str) -> Result<serde_json::Value> {
        let metadata = self.load_document_metadata(document_path)?;
        let chats = self.load_chats(document_path).ok();
        let notes = self.load_all_notes_from_markdown(document_path)?;

        let result = serde_json::json!({
            "metadata": metadata,
            "chats": chats,
            "notes": notes,
        });

        Ok(result)
    }

    pub fn debug_list_all_metadata(&self) -> Result<Vec<DocumentMetadata>> {
        println!("[DB] debug_list_all_metadata: fetching all rows");
        let mut stmt = self.connection.prepare(
            "SELECT id, document_path, chat_id, view_mode, scale, current_page, scroll_position, settings_json, created_at, updated_at
             FROM document_metadata"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(DocumentMetadata {
                id: row.get(0)?,
                document_path: row.get(1)?,
                chat_id: row.get(2)?,
                view_mode: row.get(3)?,
                scale: row.get(4)?,
                current_page: row.get(5)?,
                scroll_position: row.get(6)?,
                settings_json: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            let m = row?;
            println!(
                "[DB] debug row: path={}, page={}",
                m.document_path, m.current_page
            );
            results.push(m);
        }

        println!("[DB] debug_list_all_metadata: found {} rows", results.len());
        Ok(results)
    }
}
