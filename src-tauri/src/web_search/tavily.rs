use reqwest::Client;
use serde_json::Value;
use crate::web_search::SearchResult;

pub async fn search(
    client: &Client,
    query: &str,
    api_key: Option<String>,
    max_results: u32,
) -> Result<Vec<SearchResult>, String> {
    println!("[RUST] Tavily search called");
    
    let key = api_key.ok_or("Tavily API key is required")?;
    
    let search_url = "https://api.tavily.com/search";
    
    let payload = serde_json::json!({
        "query": query,
        "api_key": key,
        "max_results": max_results,
        "include_answer": false,
        "include_raw_content": false,
        "search_depth": "basic"
    });
    
    let response = client
        .post(search_url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Tavily request failed: {}", e))?;
    
    let status = response.status();
    println!("[RUST] Tavily API status: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[RUST] Tavily API error: {}", error_text);
        return Err(format!("Tavily API error: {}", error_text));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    
    // Parse Tavily response
    if let Ok(json) = serde_json::from_str::<Value>(&body) {
        let results: Vec<SearchResult> = json
            .get("results")
            .and_then(|r| r.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|item| SearchResult {
                        title: item.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                        url: item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                        snippet: item.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                        published_date: item.get("published_date").and_then(|d| d.as_str()).map(|s| s.to_string()),
                        is_pdf: Some(item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_lowercase().ends_with(".pdf")),
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        println!("[RUST] Tavily returned {} results", results.len());
        return Ok(results);
    }
    
    Err("Failed to parse Tavily response".to_string())
}