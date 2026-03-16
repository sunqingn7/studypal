use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::tts::{TTSRequest, TTSResponse};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeVoice {
    pub short_name: String,
    pub localized_name: String,
    pub gender: String,
    pub locale: String,
}

pub struct EdgeTTS {
    client: Client,
}

impl EdgeTTS {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn get_voices(&self) -> Result<Vec<EdgeVoice>, String> {
        let url = "https://edge.microsoft.com/voice/config/v1/edge-speech-configuration";
        
        let response = self.client
            .get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch voices: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to fetch voices: HTTP {}", response.status()));
        }

        let config: serde_json::Value = response.json()
            .await
            .map_err(|e| format!("Failed to parse voices response: {}", e))?;

        let mut voices = Vec::new();
        
        if let Some(voice_config) = config.get("voice").and_then(|v| v.get("voices")).and_then(|v| v.as_array()) {
            for voice in voice_config {
                if let (Some(short_name), Some(localized_name)) = (
                    voice.get("shortName").and_then(|s| s.as_str()),
                    voice.get("localizedName").and_then(|s| s.as_str()),
                ) {
                    voices.push(EdgeVoice {
                        short_name: short_name.to_string(),
                        localized_name: localized_name.to_string(),
                        gender: voice.get("gender").and_then(|g| g.as_str()).unwrap_or("Unknown").to_string(),
                        locale: voice.get("locale").and_then(|l| l.as_str()).unwrap_or("en-US").to_string(),
                    });
                }
            }
        }

        if voices.is_empty() {
            // Default voices if API fails
            voices.push(EdgeVoice {
                short_name: "en-US-JennyNeural".to_string(),
                localized_name: "Jenny (Online) (English (United States))".to_string(),
                gender: "Female".to_string(),
                locale: "en-US".to_string(),
            });
            voices.push(EdgeVoice {
                short_name: "en-US-GuyNeural".to_string(),
                localized_name: "Guy (Online) (English (United States))".to_string(),
                gender: "Male".to_string(),
                locale: "en-US".to_string(),
            });
        }

        Ok(voices)
    }

    pub async fn synthesize(&self, request: TTSRequest) -> Result<TTSResponse, String> {
        let url = "https://api.edge-tts.microsoft.com/v1/synthesize";
        
        let voice = request.voice.unwrap_or_else(|| "en-US-JennyNeural".to_string());
        let rate = request.rate.unwrap_or(0.0);
        let pitch = request.pitch.unwrap_or(0.0);
        let volume = request.volume.unwrap_or(0.0);

        // Build SSML
        let ssml = format!(
            r#"
            <speak version="1.0" xml:lang="en-US"
                xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml">
                <voice name="{}">
                    <prosody rate="{}%" pitch="{}Hz" volume="{}%">
                        {}
                    </prosody>
                </voice>
            </speak>
            "#,
            voice,
            rate,
            pitch,
            volume,
            request.text
        );

        let response = self.client
            .post(url)
            .header("Content-Type", "application/ssml+xml")
            .header("User-Agent", "Mozilla/5.0")
            .header("X-Microsoft-OutputFormat", "audio-24khz-48kbitrate-monaural-mp3")
            .body(ssml)
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
    async fn test_get_voices() {
        let tts = EdgeTTS::new();
        let voices = tts.get_voices().await;
        assert!(voices.is_ok());
        assert!(!voices.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_synthesize() {
        let tts = EdgeTTS::new();
        let request = TTSRequest {
            text: "Hello, world!".to_string(),
            voice: Some("en-US-JennyNeural".to_string()),
            rate: None,
            pitch: None,
            volume: None,
        };
        let response = tts.synthesize(request).await;
        assert!(response.is_ok());
        assert!(!response.unwrap().audio_data.is_empty());
    }
}
