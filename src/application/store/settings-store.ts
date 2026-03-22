import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PluginConfig } from '../../domain/models/plugin';

export type SearchProvider = 'brave' | 'tavily' | 'duckduckgo' | 'serper' | 'custom';
export type TTSBackendType = 'edge' | 'qwen' | 'system';

export interface WebSearchConfig {
  provider: SearchProvider;
  apiKey?: string;
  maxResults: number;
  defaultQueryType: 'general' | 'academic' | 'news';
  academicFilters: {
    yearFrom?: number;
    yearTo?: number;
    pdfOnly: boolean;
  };
}

export interface EdgeTTSConfig {
  enabled: boolean;
  voice: string;
  speed: number;
}

export interface QwenTTSConfig {
  enabled: boolean;
  serverUrl: string;
  voice: string;
  speed: number;
  systemPrompt?: string;
}

export interface SystemTTSConfig {
  enabled: boolean;
  voice?: string;
  speed: number;
}

export interface TTSConfig {
  defaultBackend: TTSBackendType;
  edge: EdgeTTSConfig;
  qwen: QwenTTSConfig;
  system: SystemTTSConfig;
  volume: number;
  autoPlayInClassroom: boolean;
}

export interface GlobalSettings {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  webSearch: WebSearchConfig;
  tts: TTSConfig;
}

export interface SettingsState {
  global: GlobalSettings;
  plugins: Record<string, PluginConfig>;

  updateGlobal: (settings: Partial<GlobalSettings>) => void;
  updateWebSearch: (config: Partial<WebSearchConfig>) => void;
  updateTTS: (config: Partial<TTSConfig>) => void;
  updatePluginConfig: (pluginId: string, config: PluginConfig) => void;
  getPluginConfig: (pluginId: string) => PluginConfig | undefined;
  resetToDefaults: () => void;
}

const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'duckduckgo',
  apiKey: '',
  maxResults: 10,
  defaultQueryType: 'academic',
  academicFilters: {
    yearFrom: undefined,
    yearTo: undefined,
    pdfOnly: true,
  },
};

const DEFAULT_TTS_CONFIG: TTSConfig = {
  defaultBackend: 'edge',
  edge: {
    enabled: true,
    voice: 'auto',
    speed: 1.0,
  },
  qwen: {
    enabled: false,
    serverUrl: 'http://localhost:8083',
    voice: 'Vivian',
    speed: 1.0,
    systemPrompt: '',
  },
  system: {
    enabled: false,
    speed: 1.0,
  },
  volume: 1.0,
  autoPlayInClassroom: false,
};

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'en',
  theme: 'auto',
  autoSave: true,
  webSearch: DEFAULT_WEB_SEARCH_CONFIG,
  tts: DEFAULT_TTS_CONFIG,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      global: DEFAULT_GLOBAL_SETTINGS,
      plugins: {},

      updateGlobal: (settings) => {
        set({ global: { ...get().global, ...settings } });
      },

      updateWebSearch: (config) => {
        set({
          global: {
            ...get().global,
            webSearch: { ...get().global.webSearch, ...config },
          },
        });
      },

      updateTTS: (config) => {
        set({
          global: {
            ...get().global,
            tts: { ...get().global.tts, ...config },
          },
        });
      },

      updatePluginConfig: (pluginId, config) => {
        set({
          plugins: { ...get().plugins, [pluginId]: config }
        });
      },

      getPluginConfig: (pluginId) => {
        return get().plugins[pluginId];
      },

      resetToDefaults: () => {
        set({
          global: DEFAULT_GLOBAL_SETTINGS,
          plugins: {}
        });
      },
    }),
    {
      name: 'studypal-settings',
      partialize: (state) => ({ 
        global: state.global,
        plugins: state.plugins,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.global.tts) {
            state.global.tts = DEFAULT_TTS_CONFIG;
          }
          if (!state.global.webSearch) {
            state.global.webSearch = DEFAULT_WEB_SEARCH_CONFIG;
          }
        }
      },
    }
  )
);
