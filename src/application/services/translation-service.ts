import { invoke } from '@tauri-apps/api/core';

export interface TranslateResponse {
  success: boolean;
  output_paths: string[];
  error: string | null;
}

export async function translateDocument(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  pages?: number[]
): Promise<TranslateResponse> {
  try {
    const result = await invoke<TranslateResponse>('translate_document', {
      inputPath,
      sourceLang,
      targetLang,
      pages,
    });
    return result;
  } catch (error) {
    console.error('[TranslationService] Error:', error);
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