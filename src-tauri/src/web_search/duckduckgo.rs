use reqwest::Client;
use serde_json::Value;
use crate::web_search::SearchResult;

pub async fn search(
    client: &Client,
    query: &str,
    max_results: u32,
) -> Result<Vec<SearchResult>, String> {
    println!("[RUST] DuckDuckGo search called");
    
    let search_url = format!(
        "https://ddg-api.vercel.app/search?q={}&max_results={}",
        urlencoding::encode(query),
        max_results
    );
    
    let response = client
        .get(&search_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("DuckDuckGo request failed: {}", e))?;
    
    let status = response.status();
    println!("[RUST] DuckDuckGo API status: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] DuckDuckGo API error: {}", error_text);
        return Err(format!("DuckDuckGo API error: {}", error_text));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    
    // Parse DuckDuckGo response
    if let Ok(json) = serde_json::from_str::<Value>(&body) {
        if let Some(arr) = json.as_array() {
            let results: Vec<SearchResult> = arr
                .iter()
                .map(|item| SearchResult {
                    title: item.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                    url: item.get("href").and_then(|h| h.as_str()).unwrap_or(
                        item.get("url").and_then(|u| u.as_str()).unwrap_or("")
                    ).to_string(),
                    snippet: item.get("body").and_then(|b| b.as_str()).unwrap_or(
                        item.get("snippet").and_then(|s| s.as_str()).unwrap_or("")
                    ).to_string(),
                    published_date: item.get("date").and_then(|d| d.as_str()).map(|s| s.to_string()),
                    is_pdf: Some(false), // DuckDuckGo doesn't provide this info directly
                })
                .collect();
            
            println!("[RUST] DuckDuckGo returned {} results", results.len());
            return Ok(results);
        }
    }
    
    Err("Failed to parse DuckDuckGo response".to_string())
}