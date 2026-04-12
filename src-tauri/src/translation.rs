use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslatedPdfRequest {
    input_path: String,
    translated_text: String,
    source_lang: String,
    target_lang: String,
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

/// Legacy pdf2zh-based translation (fallback method)
#[tauri::command]
pub async fn translate_document_pdf2zh(
    input_path: String,
    source_lang: String,
    target_lang: String,
    _pages: Option<Vec<i32>>,
) -> Result<TranslateResponse, String> {
    log::info!("[translate_document_pdf2zh] Starting translation: {} -> {}", source_lang, target_lang);

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
    log::info!("[translate_document_pdf2zh] Cache directory: {:?}", doc_cache_dir);

    // Create output directory based on document hash
    let output_dir = doc_cache_dir.clone();
    let output_dir_str = output_dir.to_string_lossy().to_string();

    // Check if full translation already exists
    let input_stem = Path::new(&input_path)
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "translated".to_string());

    let mono_path = output_dir.join(format!("{}-mono.pdf", input_stem));
    let dual_path = output_dir.join(format!("{}-dual.pdf", input_stem));

    let translated_path = if mono_path.exists() {
        mono_path.clone()
    } else if dual_path.exists() {
        dual_path.clone()
    } else {
        log::info!("[translate_document_pdf2zh] No cached translation found, translating...");

        // Build pdf2zh command
        let mut cmd = Command::new("pdf2zh");
        cmd.arg(&input_path)
            .arg("-li").arg(&source_lang)
            .arg("-lo").arg(&target_lang)
            .arg("-o").arg(&output_dir_str);

        log::info!("[translate_document_pdf2zh] Running: pdf2zh {:?} -li {} -lo {} -o {}",
            input_path, source_lang, target_lang, output_dir_str);

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!("[translate_document_pdf2zh] Translation completed successfully");

                    if dual_path.exists() {
                        dual_path.clone()
                    } else if mono_path.exists() {
                        mono_path.clone()
                    } else {
                        return Ok(TranslateResponse {
                            success: false,
                            output_paths: vec![],
                            error: Some("Translation completed but output file not found".to_string()),
                        });
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::error!("[translate_document_pdf2zh] Translation failed: {}", stderr);
                    return Ok(TranslateResponse {
                        success: false,
                        output_paths: vec![],
                        error: Some(stderr.to_string()),
                    });
                }
            }
            Err(e) => {
                log::error!("[translate_document_pdf2zh] Failed to run pdf2zh: {}", e);
                return Ok(TranslateResponse {
                    success: false,
                    output_paths: vec![],
                    error: Some(format!("Failed to run pdf2zh: {}", e)),
                });
            }
        }
    };

    let translated_path_str = translated_path.to_string_lossy().to_string();
    log::info!("[translate_document_pdf2zh] Translated PDF at: {}", translated_path_str);

    Ok(TranslateResponse {
        success: true,
        output_paths: vec![translated_path_str],
        error: None,
    })
}

/// Generate a translated PDF from translated text
/// Creates a simple PDF with the translated text content
#[tauri::command]
pub async fn generate_translated_pdf(
    input_path: String,
    translated_text: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    log::info!("[generate_translated_pdf] Generating translated PDF: {} -> {}", source_lang, target_lang);

    // Get document-specific cache directory
    let doc_cache_dir = get_doc_cache_dir(&input_path, &source_lang, &target_lang)?;

    // Get input file name
    let input_stem = Path::new(&input_path)
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "translated".to_string());

    // Create output path
    let output_path = doc_cache_dir.join(format!("{}-llm.pdf", input_stem));
    let output_path_str = output_path.to_string_lossy().to_string();

    // Try multiple methods to generate PDF

    // Method 1: Try using pandoc (supports multiple formats)
    if let Ok(temp_md) = create_temp_markdown(&translated_text) {
        let result = Command::new("pandoc")
            .arg(&temp_md)
            .arg("-o")
            .arg(&output_path_str)
            .arg("--pdf-engine=xelatex")
            .arg("-V")
            .arg(format!("mainfont={}", font_for_language(&target_lang)))
            .output();

        if let Ok(output) = result {
            if output.status.success() && output_path.exists() {
                log::info!("[generate_translated_pdf] PDF generated using pandoc: {}", output_path_str);
                let _ = fs::remove_file(&temp_md);
                return Ok(output_path_str);
            }
        }
        let _ = fs::remove_file(&temp_md);
    }

    // Method 2: Try using wkhtmltopdf (HTML to PDF)
    if let Ok(temp_html) = create_temp_html(&translated_text, &target_lang) {
        let result = Command::new("wkhtmltopdf")
            .arg("--encoding")
            .arg("utf-8")
            .arg(&temp_html)
            .arg(&output_path_str)
            .output();

        if let Ok(output) = result {
            if output.status.success() && output_path.exists() {
                log::info!("[generate_translated_pdf] PDF generated using wkhtmltopdf: {}", output_path_str);
                let _ = fs::remove_file(&temp_html);
                return Ok(output_path_str);
            }
        }
        let _ = fs::remove_file(&temp_html);
    }

    // Method 3: Try using weasyprint (Python HTML to PDF)
    if let Ok(temp_html) = create_temp_html(&translated_text, &target_lang) {
        let result = Command::new("weasyprint")
            .arg(&temp_html)
            .arg(&output_path_str)
            .output();

        if let Ok(output) = result {
            if output.status.success() && output_path.exists() {
                log::info!("[generate_translated_pdf] PDF generated using weasyprint: {}", output_path_str);
                let _ = fs::remove_file(&temp_html);
                return Ok(output_path_str);
            }
        }
        let _ = fs::remove_file(&temp_html);
    }

    // Method 4: Create a simple text-based PDF using Python with reportlab
    if let Ok(_output) = create_pdf_with_python(&translated_text, &output_path_str, &target_lang).await {
        if output_path.exists() {
            log::info!("[generate_translated_pdf] PDF generated using Python/reportlab: {}", output_path_str);
            return Ok(output_path_str);
        }
    }

    // Method 5: Fallback - save as text file with PDF extension (will be displayed as text)
    // This is a last resort - the file won't be a real PDF but at least content is preserved
    log::warn!("[generate_translated_pdf] Falling back to plain text file");
    fs::write(&output_path, format!("Translated Document\n\n{}", translated_text))
        .map_err(|e| format!("Failed to write fallback file: {}", e))?;

    Ok(output_path_str)
}

/// Create a temporary markdown file
fn create_temp_markdown(text: &str) -> Result<PathBuf, String> {
    let cache_dir = ensure_cache_dir()?;
    let temp_path = cache_dir.join(format!("temp_{}.md", std::process::id()));
    fs::write(&temp_path, text).map_err(|e| e.to_string())?;
    Ok(temp_path)
}

/// Create a temporary HTML file with proper encoding
fn create_temp_html(text: &str, lang: &str) -> Result<PathBuf, String> {
    let cache_dir = ensure_cache_dir()?;
    let temp_path = cache_dir.join(format!("temp_{}.html", std::process::id()));

    // Get font family for the language
    let font_family = font_for_language(lang);

    // Convert text to HTML
    let html_content = format!(
        r#"<!DOCTYPE html>
<html lang="{}">
<head>
    <meta charset="UTF-8">
    <title>Translated Document</title>
    <style>
        body {{
            font-family: "{}", sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }}
        p {{ margin: 1em 0; }}
    </style>
</head>
<body>
    {}
</body>
</html>"#,
        lang,
        font_family,
        text.split("\n\n").map(|p| format!("<p>{}</p>", html_escape(p))).collect::<String>()
    );

    fs::write(&temp_path, html_content).map_err(|e| e.to_string())?;
    Ok(temp_path)
}

/// Escape HTML special characters
fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Get appropriate font for language
fn font_for_language(lang: &str) -> &'static str {
    match lang.to_lowercase().as_str() {
        "zh" | "zh-cn" | "zh-tw" | "ja" | "ko" => "Noto Sans CJK SC",
        "ar" => "Noto Sans Arabic",
        "hi" => "Noto Sans Devanagari",
        "ru" => "Noto Sans",
        _ => "Noto Sans",
    }
}

/// Create PDF using Python with reportlab
async fn create_pdf_with_python(
    text: &str,
    output_path: &str,
    _lang: &str,
) -> Result<(), String> {
    let python_script = format!(
        r#"
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import inch
import textwrap

# Try to register a font that supports the target language
try:
    # Try to register common system fonts
    pdfmetrics.registerFont(TTFont('NotoSans', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'))
    font_name = 'NotoSans'
except:
    try:
        pdfmetrics.registerFont(TTFont('Arial', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        font_name = 'Arial'
    except:
        try:
            pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
            font_name = 'DejaVu'
        except:
            font_name = 'Helvetica'  # fallback

c = canvas.Canvas("{}", pagesize=letter)
width, height = letter
margin = 72
text_width = width - 2 * margin
y = height - margin

lines = r'''{}'''.split('\n')

for line in lines:
    # Handle empty lines
    if not line.strip():
        y -= 12
        if y < margin:
            c.showPage()
            y = height - margin
        continue
    
    # Wrap long lines
    wrapped = textwrap.wrap(line, width=80)
    for wrapped_line in wrapped:
        c.setFont(font_name, 11)
        c.drawString(margin, y, wrapped_line)
        y -= 14
        if y < margin:
            c.showPage()
            y = height - margin

    # Add extra space between paragraphs
    y -= 6
    if y < margin:
        c.showPage()
        y = height - margin

c.save()
print("PDF created successfully")
"#,
        output_path.replace("\\", "\\\\").replace("\"", "\\\""),
        text.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"")
    );

    let output = Command::new("python3")
        .arg("-c")
        .arg(&python_script)
        .output()
        .map_err(|e| format!("Failed to run Python: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Python script failed: {}", stderr))
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
