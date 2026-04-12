import { create } from 'zustand';
import { translateDocument } from '../services/translation-service';
import { useFileStore } from './file-store';

export type Lang = 'en' | 'zh';

interface TranslatedPage {
  path: string;
  translatedAt: number;
}

interface TranslationState {
  isActive: boolean;
  sourceLang: Lang;
  targetLang: Lang;
  currentDocPath: string | null;
  translatedPages: Map<number, TranslatedPage>;
  translatingPages: Set<number>;
  scrollPercent: number;
  isTranslating: boolean;
  error: string | null;

  toggle: () => void;
  setLanguages: (source: Lang, target: Lang) => void;
  setCurrentDocPath: (path: string | null) => void;
  setScrollPercent: (percent: number) => void;
  translatePage: (pageNum: number) => Promise<string | null>;
  translateAndPrefetch: (currentPage: number, totalPages: number) => Promise<void>;
  getTranslatedPath: (pageNum: number) => string | null;
  clearCache: () => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  isActive: false,
  sourceLang: 'en',
  targetLang: 'zh',
  currentDocPath: null,
  translatedPages: new Map(),
  translatingPages: new Set(),
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
        translatedPages: new Map(),
        translatingPages: new Set(),
        error: null 
      });
    }
  },

  setScrollPercent: (percent: number) => {
    set({ scrollPercent: percent });
  },

  translatePage: async (pageNum: number): Promise<string | null> => {
    const state = get();
    
    if (!state.currentDocPath) {
      console.warn('[TranslationStore] No document path set');
      return null;
    }

    // Check if already translated or being translated
    if (state.translatedPages.has(pageNum)) {
      return state.translatedPages.get(pageNum)!.path;
    }
    
    if (state.translatingPages.has(pageNum)) {
      console.log('[TranslationStore] Page', pageNum, 'already being translated');
      return null;
    }

    // Mark as translating
    set((s) => ({
      translatingPages: new Set(s.translatingPages).add(pageNum),
      isTranslating: true,
      error: null,
    }));

    try {
      const result = await translateDocument(
        state.currentDocPath,
        state.sourceLang,
        state.targetLang,
        [pageNum]
      );

      if (result.success && result.output_paths.length > 0) {
        const translatedPath = result.output_paths[0];
        
        // Update translated pages
        set((s) => {
          const newMap = new Map(s.translatedPages);
          newMap.set(pageNum, { path: translatedPath, translatedAt: Date.now() });
          
          const newTranslating = new Set(s.translatingPages);
          newTranslating.delete(pageNum);
          
          return {
            translatedPages: newMap,
            translatingPages: newTranslating,
            isTranslating: newTranslating.size > 0,
          };
        });

        return translatedPath;
      } else {
        const errorMsg = result.error || 'Translation failed';
        console.error('[TranslationStore] Translation error:', errorMsg);
        
        set((s) => {
          const newTranslating = new Set(s.translatingPages);
          newTranslating.delete(pageNum);
          return {
            translatingPages: newTranslating,
            isTranslating: newTranslating.size > 0,
            error: errorMsg,
          };
        });
        
        return null;
      }
    } catch (error) {
      console.error('[TranslationStore] Exception:', error);
      
      set((s) => {
        const newTranslating = new Set(s.translatingPages);
        newTranslating.delete(pageNum);
        return {
          translatingPages: newTranslating,
          isTranslating: newTranslating.size > 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      });
      
      return null;
    }
  },

  translateAndPrefetch: async (currentPage: number, totalPages: number) => {
    const PREFETCH_AHEAD = 3;
    
    // Translate current page first
    await get().translatePage(currentPage);
    
    // Then prefetch ahead pages
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const nextPage = currentPage + i;
      if (nextPage <= totalPages) {
        // Fire and forget - don't await
        get().translatePage(nextPage);
      }
    }
  },

  getTranslatedPath: (pageNum: number): string | null => {
    const state = get();
    const page = state.translatedPages.get(pageNum);
    return page?.path || null;
  },

  clearCache: () => {
    set({
      translatedPages: new Map(),
      translatingPages: new Set(),
      error: null,
    });
  },
}));