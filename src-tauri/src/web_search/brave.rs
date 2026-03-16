use reqwest::Client;
use serde_json::Value;
use crate::web_search::SearchResult;

pub async fn search(
    client: &Client,
    query: &str,
    api_key: Option<String>,
    max_results: u32,
) -> Result<Vec<SearchResult>, String> {
    println!("[RUST] Brave search called");
    
    let key = api_key.ok_or("Brave API key is required")?;
    
    let search_url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count={}&offset=0",
        urlencoding::encode(query),
        max_results
    );
    
    let response = client
        .get(&search_url)
        .header("X-Subscription-Token", key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Brave request failed: {}", e))?;
    
    let status = response.status();
    println!("[RUST] Brave API status: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] Brave API error: {}", error_text);
        return Err(format!("Brave API error: {}", error_text));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    
    // Parse Brave response
    if let Ok(json) = serde_json::from_str::<Value>(&body) {
        let results: Vec<SearchResult> = json
            .get("web")
            .and_then(|w| w.get("results"))
            .and_then(|r| r.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|item| SearchResult {
                        title: item.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                        url: item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                        snippet: item.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                        published_date: item.get("age").and_then(|a| a.as_str()).map(|s| s.to_string()),
                        is_pdf: Some(item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_lowercase().ends_with(".pdf")),
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        println!("[RUST] Brave returned {} results", results.len());
        return Ok(results);
    }
    
    Err("Failed to parse Brave response".to_string())
}