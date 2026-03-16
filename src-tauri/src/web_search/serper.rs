use reqwest::Client;
use serde_json::Value;
use crate::web_search::SearchResult;

pub async fn search(
    client: &Client,
    query: &str,
    api_key: Option<String>,
    max_results: u32,
) -> Result<Vec<SearchResult>, String> {
    println!("[RUST] Serper search called");
    
    let key = api_key.ok_or("Serper API key is required")?;
    
    let search_url = "https://google.serper.dev/search";
    
    let payload = serde_json::json!({
        "q": query,
        "num": max_results
    });
    
    let response = client
        .post(search_url)
        .header("X-API-KEY", key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Serper request failed: {}", e))?;
    
    let status = response.status();
    println!("[RUST] Serper API status: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] Serper API error: {}", error_text);
        return Err(format!("Serper API error: {}", error_text));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    
    // Parse Serper response
    if let Ok(json) = serde_json::from_str::<Value>(&body) {
        let results: Vec<SearchResult> = json
            .get("organic")
            .and_then(|o| o.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|item| SearchResult {
                        title: item.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                        url: item.get("link").and_then(|l| l.as_str()).unwrap_or("").to_string(),
                        snippet: item.get("snippet").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                        published_date: item.get("date").and_then(|d| d.as_str()).map(|s| s.to_string()),
                        is_pdf: Some(item.get("link").and_then(|l| l.as_str()).unwrap_or("").to_lowercase().ends_with(".pdf")),
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        println!("[RUST] Serper returned {} results", results.len());
        return Ok(results);
    }
    
    Err("Failed to parse Serper response".to_string())
}