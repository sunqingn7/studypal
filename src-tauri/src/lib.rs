use tauri::Manager;

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
        .invoke_handler(tauri::generate_handler![fetch_web_content, search_web])
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
