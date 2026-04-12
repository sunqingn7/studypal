import { invoke } from '@tauri-apps/api/core';
import { useLLMPoolStore } from '../store/llm-pool-store';
import { getProvider } from '../../infrastructure/ai-providers/provider-factory';
import { ChatMessage } from '../../domain/models/ai-context';

export interface TranslateResponse {
  success: boolean;
  output_paths: string[];
  error: string | null;
}

export interface TranslateTextRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  provider?: {
    config: {
      provider: string;
      apiKey?: string;
      endpoint?: string;
      model?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
}

// Maximum chunk size for translation (in characters) - helps manage token limits
const MAX_CHUNK_SIZE = 4000;
// Maximum text length before we warn about truncation
const MAX_TEXT_LENGTH = 50000;

/**
 * Split text into chunks for translation
 * Tries to split at paragraph boundaries for better context
 */
function splitTextIntoChunks(text: string, maxChunkSize: number = MAX_CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  let currentChunk = '';
  for (const paragraph of paragraphs) {
    if ((currentChunk.length + paragraph.length) > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Get translation system prompt based on language pair
 */
function getTranslationSystemPrompt(sourceLang: string, targetLang: string): string {
  const langNames: Record<string, string> = {
    'en': 'English',
    'zh': 'Chinese',
    'zh-cn': 'Simplified Chinese',
    'zh-tw': 'Traditional Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'it': 'Italian',
    'ru': 'Russian',
    'pt': 'Portuguese',
    'ar': 'Arabic',
    'hi': 'Hindi',
  };

  const sourceName = langNames[sourceLang.toLowerCase()] || sourceLang;
  const targetName = langNames[targetLang.toLowerCase()] || targetLang;

  return `You are a professional translator. Translate the following text from ${sourceName} to ${targetName}.

Rules:
1. Maintain the original formatting and paragraph structure
2. Preserve technical terms accurately
3. Translate naturally and fluently
4. Do not add explanations or notes
5. Do not output anything other than the translation
6. If the text contains mixed languages, translate only the ${sourceName} portions`;
}

/**
 * Translate text using LLM provider
 * Falls back to null if LLM is not available or translation fails
 */
export async function translateTextWithLLM(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider?: TranslateTextRequest['provider']
): Promise<string | null> {
  console.log('[TranslationService] Translating with LLM:', { sourceLang, targetLang, textLength: text.length });

  // Warn if text is very long
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn('[TranslationService] Text is very long, may be truncated:', text.length);
  }

  // Get provider configuration
  let providerConfig = provider;
  if (!providerConfig) {
    const store = useLLMPoolStore.getState();
    const primaryProvider = store.getPrimaryProvider();
    if (!primaryProvider) {
      console.log('[TranslationService] No LLM provider available');
      return null;
    }
    providerConfig = { config: primaryProvider.config };
  }

  try {
    const aiProvider = getProvider(providerConfig.config.provider as any);
    const messages: ChatMessage[] = [
      {
        id: crypto.randomUUID(),
        role: 'system',
        content: getTranslationSystemPrompt(sourceLang, targetLang),
        timestamp: Date.now(),
      },
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      },
    ];

    const result = await aiProvider.chat(messages, {
      provider: providerConfig.config.provider as any,
      endpoint: providerConfig.config.endpoint || '',
      model: providerConfig.config.model || '',
      apiKey: providerConfig.config.apiKey,
      systemPrompt: providerConfig.config.systemPrompt,
      temperature: 0.3,
      maxTokens: 4096,
    });

    return result.trim();
  } catch (error) {
    console.error('[TranslationService] LLM translation failed:', error);
    return null;
  }
}

/**
 * Translate text in chunks using LLM
 * Returns null if any chunk fails
 */
export async function translateTextWithLLMChunked(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider?: TranslateTextRequest['provider'],
  onProgress?: (current: number, total: number) => void
): Promise<string | null> {
  // For short texts, translate in one go
  if (text.length <= MAX_CHUNK_SIZE) {
    return translateTextWithLLM(text, sourceLang, targetLang, provider);
  }

  // Split into chunks
  const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  const translatedChunks: string[] = [];

  console.log('[TranslationService] Translating in', chunks.length, 'chunks');

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);

    const translated = await translateTextWithLLM(chunks[i], sourceLang, targetLang, provider);
    if (!translated) {
      console.error('[TranslationService] Failed to translate chunk', i + 1);
      return null;
    }
    translatedChunks.push(translated);
  }

  return translatedChunks.join('\n\n');
}

/**
 * Main translation function
 * Tries LLM first, falls back to pdf2zh
 */
export async function translateDocument(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  pages?: number[]
): Promise<TranslateResponse> {
  console.log('[TranslationService] Starting translation:', { inputPath, sourceLang, targetLang, pages });

  // Step 1: Try LLM translation first
  try {
    const llmResult = await translateWithLLM(inputPath, sourceLang, targetLang, pages);
    if (llmResult.success) {
      console.log('[TranslationService] LLM translation succeeded');
      return llmResult;
    }
    console.log('[TranslationService] LLM translation failed, falling back to pdf2zh');
  } catch (error) {
    console.error('[TranslationService] LLM translation error:', error);
    console.log('[TranslationService] Falling back to pdf2zh');
  }

  // Step 2: Fall back to pdf2zh
  return translateWithPdf2zh(inputPath, sourceLang, targetLang, pages);
}

/**
 * Translate using LLM provider
 * Extracts text, translates, and generates new PDF
 */
async function translateWithLLM(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  pages?: number[]
): Promise<TranslateResponse> {
  // Get primary LLM provider
  const store = useLLMPoolStore.getState();
  const primaryProvider = store.getPrimaryProvider();

  if (!primaryProvider) {
    return {
      success: false,
      output_paths: [],
      error: 'No LLM provider available',
    };
  }

  console.log('[TranslationService] Using LLM provider:', primaryProvider.config.provider);

  try {
    // Extract text from PDF
    console.log('[TranslationService] Extracting text from PDF...');
    const text = await invoke<string>('extract_pdf_text', {
      path: inputPath,
      pageNumbers: pages?.map(p => Number(p)),
    });

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        output_paths: [],
        error: 'No text extracted from PDF',
      };
    }

    console.log('[TranslationService] Extracted text length:', text.length);

    // Translate text with LLM
    const translatedText = await translateTextWithLLMChunked(
      text,
      sourceLang,
      targetLang,
      { config: primaryProvider.config },
      (current, total) => {
        console.log(`[TranslationService] Progress: ${current}/${total} chunks`);
      }
    );

    if (!translatedText) {
      return {
        success: false,
        output_paths: [],
        error: 'LLM translation failed',
      };
    }

    // Generate translated PDF
    console.log('[TranslationService] Generating translated PDF...');
    const outputPath = await invoke<string>('generate_translated_pdf', {
      inputPath,
      translatedText,
      sourceLang,
      targetLang,
    });

    return {
      success: true,
      output_paths: [outputPath],
      error: null,
    };
  } catch (error) {
    console.error('[TranslationService] LLM translation error:', error);
    return {
      success: false,
      output_paths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Translate using pdf2zh (fallback method)
 */
async function translateWithPdf2zh(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  pages?: number[]
): Promise<TranslateResponse> {
  try {
    const result = await invoke<TranslateResponse>('translate_document_pdf2zh', {
      inputPath,
      sourceLang,
      targetLang,
      pages,
    });
    return result;
  } catch (error) {
    console.error('[TranslationService] pdf2zh error:', error);
    return {
      success: false,
      output_paths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getTranslationCacheDir(): Promise<string> {
  try {
    return await invoke<string>('get_translation_cache_dir');
  } catch (error) {
    console.error('[TranslationService] Error getting cache dir:', error);
    return '';
  }
}

export async function clearTranslationCache(docPath?: string): Promise<boolean> {
  try {
    return await invoke<boolean>('clear_translation_cache', { docPath });
  } catch (error) {
    console.error('[TranslationService] Error clearing cache:', error);
    return false;
  }
}
