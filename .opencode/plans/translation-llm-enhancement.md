# Translation LLM Enhancement Implementation Plan

## Overview
Implement LLM-based PDF translation using pdf2zh's native LLM support with script generation, proper error handling, and user-controlled fallback.

## Requirements
1. Use primary LLM provider from LLM pool, fallback to Google via pdf2zh
2. Generate OS-specific scripts (shell for Unix, batch for Windows)
3. Auto-detect Python venv or allow manual configuration
4. Support custom translation prompts
5. Expose parallel threads setting
6. Add Stop and Redo buttons to translation view
7. Show error modal with retry/fallback options

---

## Files to Modify

### 1. settings-store.ts
**Location:** `src/application/store/settings-store.ts`

**Add new types:**
```typescript
export type TranslationService = 'auto' | 'llm' | 'google';

export interface TranslationConfig {
  service: TranslationService;
  usePrimaryProvider: boolean;
  manualProviderId?: string;
  venvPath: string;
  autoDetectVenv: boolean;
  customPrompt: string;
  threads: number;
}
```

**Update GlobalSettings:**
```typescript
export interface GlobalSettings {
  // ... existing fields ...
  translation: TranslationConfig;
}
```

**Default config:**
```typescript
const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  service: 'auto',
  usePrimaryProvider: true,
  venvPath: '',
  autoDetectVenv: true,
  customPrompt: `You are a professional translator. Translate the following from \${lang_in} to \${lang_out}.
- Maintain original formatting and structure
- Preserve technical terms, formulas, and mathematical expressions
- Translate naturally and fluently
- Output only the translation, no explanations

Source: \${text}
Translation:`,
  threads: 4,
};
```

**Add update function:**
```typescript
updateTranslation: (config: Partial<TranslationConfig>) => void;
```

---

### 2. SettingsView.tsx
**Location:** `src/presentation/components/views/settings-view/SettingsView.tsx`

**Add new tab:**
- Tab name: "Translation"
- Icon: BookOpen or Globe

**New settings section:**

| Setting | Type | Description |
|---------|------|-------------|
| Translation Service | Select | 'auto', 'llm', 'google' |
| Python venv path | Text + Browse | Manual venv path |
| Auto-detect venv | Checkbox | Try common locations |
| Use Primary Provider | Toggle | Use LLM pool's primary |
| Provider | Select | (shown when toggle off) |
| Threads | Number input | Parallel translation threads |
| Custom Prompt | Textarea | Translation prompt template |

**Venv auto-detect paths (in order):**
1. `.venv/bin/activate`
2. `venv/bin/activate`
3. `../.venv/bin/activate`
4. `../venv/bin/activate`
5. `~/.venv/bin/activate`
6. `~/venv/bin/activate`

---

### 3. translation.rs (Complete Rewrite)
**Location:** `src-tauri/src/translation.rs`

**New structs:**
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationProviderConfig {
    pub service_name: String,      // "openai", "gemini", "ollama", "openailiked"
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub custom_prompt: Option<String>,
    pub venv_path: Option<String>,
    pub threads: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateRequest {
    pub input_path: String,
    pub source_lang: String,
    pub target_lang: String,
    pub pages: Option<Vec<i32>>,
    pub use_llm: bool,
    pub provider_config: Option<TranslationProviderConfig>,
    pub force_retranslate: bool,
}
```

**Commands:**
```rust
#[tauri::command]
pub async fn translate_document(request: TranslateRequest) -> Result<TranslateResponse, String>

#[tauri::command]
pub async fn stop_translation() -> Result<bool, String>

#[tauri::command]
pub async fn clear_translation_cache(doc_path: Option<String>) -> Result<bool, String>
```

**Script Templates:**

Unix (.sh):
```bash
#!/bin/bash
set -e
VENV_PATH="{{VENV_PATH}}"
if [ -n "$VENV_PATH" ] && [ -f "$VENV_PATH/bin/activate" ]; then
    source "$VENV_PATH/bin/activate"
fi
{{ENV_EXPORTS}}
pdf2zh "{{INPUT_PATH}}" \
    -li "{{SOURCE_LANG}}" \
    -lo "{{TARGET_LANG}}" \
    -s "{{SERVICE}}" \
    -t "{{THREADS}}" \
    -o "{{OUTPUT_DIR}}" \
    {{PROMPT_ARG}}
```

Windows (.bat):
```batch
@echo off
setlocal enabledelayedexpansion
if exist "{{VENV_PATH}}\Scripts\activate.bat" (
    call "{{VENV_PATH}}\Scripts\activate.bat"
)
{{ENV_EXPORTS}}
pdf2zh "{{INPUT_PATH}}" ^
    -li "{{SOURCE_LANG}}" ^
    -lo "{{TARGET_LANG}}" ^
    -s "{{SERVICE}}" ^
    -t "{{THREADS}}" ^
    -o "{{OUTPUT_DIR}}" ^
    {{PROMPT_ARG}}
```

**Provider to Environment Variable Mapping:**

| StudyPal Provider | pdf2zh Service | Environment Variables |
|-------------------|----------------|----------------------|
| openai | openai | OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL |
| gemini | gemini | GEMINI_API_KEY, GEMINI_MODEL |
| anthropic | openai | OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL |
| ollama | ollama | OLLAMA_HOST, OLLAMA_MODEL |
| llamacpp | openailiked | OPENAILIKED_BASE_URL, OPENAILIKED_API_KEY, OPENAILIKED_MODEL |
| vllm | openailiked | OPENAILIKED_BASE_URL, OPENAILIKED_API_KEY, OPENAILIKED_MODEL |
| openrouter | openai | OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL |
| nvidia | openai | OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL |
| custom | openailiked | OPENAILIKED_BASE_URL, OPENAILIKED_API_KEY, OPENAILIKED_MODEL |

**Security:**
- Script permissions: 600 (owner read/write only) on Unix
- Immediate script deletion after execution
- Prompt file deletion after execution
- No API keys in logs or error messages

---

### 4. translation-service.ts
**Location:** `src/application/services/translation-service.ts`

**Key functions:**

```typescript
// Main entry point
export async function translateDocument(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  options?: {
    pages?: number[];
    forceRetranslate?: boolean;
    retryProviderId?: string;
  }
): Promise<TranslateResponse>

// Stop running translation
export async function stopTranslation(): Promise<boolean>

// Build provider config from LLM pool
async function buildProviderConfig(
  provider: PoolProvider,
  settings: TranslationConfig
): Promise<TranslationProviderConfig>

// Auto-detect venv
async function detectVenv(): Promise<string | null>

// Map StudyPal provider to pdf2zh
function mapToPdf2zhService(
  studyPalProvider: AIProviderType
): { serviceName: string; envVars: Record<string, string> }

// Show error modal
async function showTranslationError(
  error: string,
  availableProviders: PoolProvider[]
): Promise<'retry-same' | 'retry-other' | 'fallback' | 'cancel' | { retry: true; providerId: string }>
```

**Error Flow:**
1. LLM translation fails
2. Call showTranslationError()
3. User chooses:
   - Retry with same provider
   - Retry with different provider (select from dropdown)
   - Use Google Translate
   - Cancel
4. Return result based on choice

---

### 5. TranslationErrorModal.tsx (New File)
**Location:** `src/presentation/components/modals/TranslationErrorModal.tsx`

**Props:**
```typescript
interface TranslationErrorModalProps {
  isOpen: boolean;
  error: string;
  availableProviders: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  onRetrySame: () => void;
  onRetryWithProvider: (providerId: string) => void;
  onFallbackToGoogle: () => void;
  onCancel: () => void;
}
```

**UI:**
- Title: "Translation Failed"
- Error message display
- [Retry with Same Provider] button
- [Select Provider ▼] dropdown + [Retry with Selected] button
- [Use Google Translate] button
- [Cancel] button

---

### 6. TranslationView.tsx
**Location:** `src/presentation/components/views/translation-view/TranslationView.tsx`

**New buttons:**

Add to translation controls:
```
[Stop Translation] [Redo / Force Retranslate] [Toggle Translation]
```

**Stop Translation button:**
- Show only when `isTranslating: true`
- Calls `stopTranslation()` service
- Kills the running pdf2zh process

**Redo/Force button:**
- Always visible
- Confirmation dialog: "Force retranslate? This will clear cached translation."
- Calls `translateDocument()` with `forceRetranslate: true`

---

### 7. lib.rs
**Location:** `src-tauri/src/lib.rs`

**Update command registration:**
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    translate_document,
    stop_translation,
    clear_translation_cache,
    // ... other commands ...
])
```

---

## Implementation Order

1. **settings-store.ts** - Add TranslationConfig
2. **SettingsView.tsx** - Add translation settings UI
3. **TranslationErrorModal.tsx** - Create error modal component
4. **translation.rs** - Rewrite with script generation
5. **translation-service.ts** - Update with LLM support
6. **TranslationView.tsx** - Add Stop/Redo buttons
7. **lib.rs** - Register new commands

---

## Testing Checklist

- [ ] Settings persist correctly
- [ ] Venv auto-detection works
- [ ] Script generates correctly (Unix/Windows)
- [ ] LLM translation with OpenAI
- [ ] LLM translation with Gemini
- [ ] LLM translation with Ollama
- [ ] Fallback to Google works
- [ ] Error modal shows correctly
- [ ] Retry with same provider works
- [ ] Retry with different provider works
- [ ] Stop translation works
- [ ] Force retranslate works
- [ ] Script cleanup works
- [ ] Security: No API keys in logs

---

## Security Considerations

1. Script file permissions: 600 (owner rw only)
2. Immediate script deletion after execution
3. Prompt file deletion after execution
4. No API keys in error messages
5. No API keys in logs
6. Environment variables set inline in script
