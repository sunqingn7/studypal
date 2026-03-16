pub mod edge_tts;
pub mod qwen_tts;

pub use edge_tts::EdgeTTS;
pub use qwen_tts::QwenTTS;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    pub voice: Option<String>,
    pub rate: Option<f64>,
    pub pitch: Option<f64>,
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSResponse {
    pub audio_data: Vec<u8>,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSServerRequest {
    pub text: String,
    pub voice: Option<String>,
    pub speed: Option<f64>,
}
