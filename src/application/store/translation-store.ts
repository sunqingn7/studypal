import { create } from 'zustand';
import { translateDocument } from '../services/translation-service';
import { useFileStore } from './file-store';

export type Lang = 'en' | 'zh';

interface TranslationState {
  isActive: boolean;
  sourceLang: Lang;
  targetLang: Lang;
  currentDocPath: string | null;
  translatedPdfPath: string | null;  // Path to the full translated PDF
  scrollPercent: number;
  isTranslating: boolean;
  error: string | null;

  toggle: () => void;
  setLanguages: (source: Lang, target: Lang) => void;
  setCurrentDocPath: (path: string | null) => void;
  setScrollPercent: (percent: number) => void;
  translatePage: (pageNum: number) => Promise<string | null>;
  translateAndPrefetch: () => Promise<void>;
  getTranslatedPath: () => string | null;
  clearCache: () => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  isActive: false,
  sourceLang: 'en',
  targetLang: 'zh',
  currentDocPath: null,
  translatedPdfPath: null,
  scrollPercent: 0,
  isTranslating: false,
  error: null,

  toggle: () => {
    const state = get();
    if (!state.isActive) {
      const fileStore = useFileStore.getState();
      if (fileStore.currentFile) {
        set({ 
          isActive: true, 
          currentDocPath: fileStore.currentFile.path,
          error: null 
        });
      } else {
        set({ isActive: true });
      }
    } else {
      set({ isActive: false });
    }
  },

  setLanguages: (source: Lang, target: Lang) => {
    set({ sourceLang: source, targetLang: target });
    // Clear cache when language changes
    get().clearCache();
  },

  setCurrentDocPath: (path: string | null) => {
    const state = get();
    if (path !== state.currentDocPath) {
      // Clear cache when document changes
      set({ 
        currentDocPath: path, 
        translatedPdfPath: null,
        error: null 
      });
    }
  },

  setScrollPercent: (percent: number) => {
    set({ scrollPercent: percent });
  },

  translatePage: async (_pageNum: number): Promise<string | null> => {
    const state = get();
    
    if (!state.currentDocPath) {
      console.warn('[TranslationStore] No document path set');
      return null;
    }

    // If we already have the full translated document, return it
    if (state.translatedPdfPath) {
      return state.translatedPdfPath;
    }
    
    // If already translating, don't start another translation
    if (state.isTranslating) {
      console.log('[TranslationStore] Already translating, waiting...');
      return null;
    }

    // Mark as translating
    set({ 
      isTranslating: true, 
      error: null,
    });

    try {
      // Translate the entire document (more efficient)
      const result = await translateDocument(
        state.currentDocPath,
        state.sourceLang,
        state.targetLang,
        undefined // No page restriction - translate full doc
      );

      if (result.success && result.output_paths.length > 0) {
        const translatedPath = result.output_paths[0];
        
        set({
          translatedPdfPath: translatedPath,
          isTranslating: false,
          error: null,
        });

        return translatedPath;
      } else {
        const errorMsg = result.error || 'Translation failed';
        console.error('[TranslationStore] Translation error:', errorMsg);
        
        set({
          isTranslating: false,
          error: errorMsg,
        });
        
        return null;
      }
    } catch (error) {
      console.error('[TranslationStore] Exception:', error);
      
      set({
        isTranslating: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return null;
    }
  },

  translateAndPrefetch: async () => {
    // Now we translate the full document at once, so just trigger translation
    await get().translatePage(1);
  },

  getTranslatedPath: (): string | null => {
    return get().translatedPdfPath;
  },

  clearCache: () => {
    set({
      translatedPdfPath: null,
      error: null,
    });
  },
}));