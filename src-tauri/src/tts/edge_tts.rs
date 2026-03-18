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
        // Return default voices - Edge TTS API is unreliable, use hardcoded list
        Ok(vec![
            EdgeVoice {
                short_name: "en-US-JennyNeural".to_string(),
                localized_name: "Jenny (Online) (English (United States))".to_string(),
                gender: "Female".to_string(),
                locale: "en-US".to_string(),
            },
            EdgeVoice {
                short_name: "en-US-GuyNeural".to_string(),
                localized_name: "Guy (Online) (English (United States))".to_string(),
                gender: "Male".to_string(),
                locale: "en-US".to_string(),
            },
            EdgeVoice {
                short_name: "en-GB-SoniaNeural".to_string(),
                localized_name: "Sonia (Online) (English (United Kingdom))".to_string(),
                gender: "Female".to_string(),
                locale: "en-GB".to_string(),
            },
            EdgeVoice {
                short_name: "zh-CN-XiaoxiaoNeural".to_string(),
                localized_name: "Xiaoxiao (Online) (Chinese (Mandarin, Simplified))".to_string(),
                gender: "Female".to_string(),
                locale: "zh-CN".to_string(),
            },
            EdgeVoice {
                short_name: "ja-JP-NanamiNeural".to_string(),
                localized_name: "Nanami (Online) (Japanese)".to_string(),
                gender: "Female".to_string(),
                locale: "ja-JP".to_string(),
            },
            EdgeVoice {
                short_name: "de-DE-KatjaNeural".to_string(),
                localized_name: "Katja (Online) (German)".to_string(),
                gender: "Female".to_string(),
                locale: "de-DE".to_string(),
            },
            EdgeVoice {
                short_name: "fr-FR-DeniseNeural".to_string(),
                localized_name: "Denise (Online) (French)".to_string(),
                gender: "Female".to_string(),
                locale: "fr-FR".to_string(),
            },
        ])
    }

    pub async fn synthesize(&self, request: TTSRequest) -> Result<TTSResponse, String> {
        // Use the correct Edge TTS synthesis endpoint
        let url = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
        
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
