pub mod brave;
pub mod tavily;
pub mod serper;
pub mod duckduckgo;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pdf: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchParams {
    pub query: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_results: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_from: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_to: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pdf_only: Option<bool>,
}

pub async fn search(params: SearchParams) -> Result<Vec<SearchResult>, String> {
    println!("[RUST] search called with provider: {}", params.provider);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    
    let max_results = params.max_results.unwrap_or(10);
    
    match params.provider.as_str() {
        "brave" => brave::search(&client, &params.query, params.api_key, max_results).await,
        "tavily" => tavily::search(&client, &params.query, params.api_key, max_results).await,
        "serper" => serper::search(&client, &params.query, params.api_key, max_results).await,
        "duckduckgo" | _ => duckduckgo::search(&client, &params.query, max_results).await,
    }
}

pub fn filter_academic_results(
    results: Vec<SearchResult>,
    year_from: Option<u32>,
    year_to: Option<u32>,
    pdf_only: bool,
) -> Vec<SearchResult> {
    results
        .into_iter()
        .filter(|result| {
            // Filter by PDF if requested
            if pdf_only && !result.url.to_lowercase().ends_with(".pdf") {
                return false;
            }
            
            // Filter by year range if specified
            if let Some(ref date) = result.published_date {
                if let Some(year_str) = date.split_whitespace().next() {
                    if let Ok(year) = year_str.parse::<u32>() {
                        if let Some(from) = year_from {
                            if year < from {
                                return false;
                            }
                        }
                        if let Some(to) = year_to {
                            if year > to {
                                return false;
                            }
                        }
                    }
                }
            }
            
            true
        })
        .collect()
}