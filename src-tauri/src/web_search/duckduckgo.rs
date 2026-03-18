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
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1&limit={}",
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
    
    if let Ok(json) = serde_json::from_str::<Value>(&body) {
        let results: Vec<SearchResult> = json
            .get("RelatedTopics")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        let url = item.get("URL").or(item.get("url")).and_then(|u| u.as_str())?;
                        if url.is_empty() {
                            return None;
                        }
                        Some(SearchResult {
                            title: item.get("Text").or(item.get("text")).and_then(|t| t.as_str()).unwrap_or("").to_string(),
                            url: url.to_string(),
                            snippet: item.get("Text").or(item.get("text")).and_then(|t| t.as_str()).unwrap_or("").to_string(),
                            published_date: None,
                            is_pdf: Some(false),
                        })
                    })
                    .take(max_results as usize)
                    .collect()
            })
            .unwrap_or_default();
        
        println!("[RUST] DuckDuckGo returned {} results", results.len());
        
        if results.is_empty() {
            return Err("No results found".to_string());
        }
        
        return Ok(results);
    }
    
    Err("Failed to parse DuckDuckGo response".to_string())
}