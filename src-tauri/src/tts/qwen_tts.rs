use reqwest::Client;
use crate::tts::{TTSRequest, TTSResponse, TTSServerRequest};

pub struct QwenTTS {
    client: Client,
    server_url: String,
}

impl QwenTTS {
    pub fn new(server_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            server_url: server_url.unwrap_or_else(|| "http://localhost:8083".to_string()),
        }
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/health", self.server_url);
        
        let response = self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    pub async fn get_voices(&self) -> Result<Vec<String>, String> {
        let url = format!("{}/voices", self.server_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch voices: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to fetch voices: HTTP {}", response.status()));
        }

        let voices: Vec<String> = response.json()
            .await
            .map_err(|e| format!("Failed to parse voices: {}", e))?;

        Ok(voices)
    }

    pub async fn synthesize(&self, request: TTSRequest) -> Result<TTSResponse, String> {
        let server_request = TTSServerRequest {
            text: request.text,
            voice: request.voice,
            speed: request.rate,
        };

        let url = format!("{}/tts", self.server_url);
        
        let response = self.client
            .post(&url)
            .json(&server_request)
            .send()
            .await
            .map_err(|e| format!("Failed to synthesize speech: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to synthesize: HTTP {} - {}", status, error_text));
        }

        let audio_data = response.bytes()
            .await
            .map_err(|e| format!("Failed to read audio data: {}", e))?;

        Ok(TTSResponse {
            audio_data: audio_data.to_vec(),
            format: "mp3".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check() {
        let tts = QwenTTS::new(Some("http://localhost:8083".to_string()));
        let healthy = tts.health_check().await;
        assert!(healthy.is_ok());
    }
}
