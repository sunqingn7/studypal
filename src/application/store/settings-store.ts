import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PluginConfig } from '../../domain/models/plugin';

export type SearchProvider = 'brave' | 'tavily' | 'duckduckgo' | 'serper' | 'custom';

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

export interface GlobalSettings {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  webSearch: WebSearchConfig;
}

export interface SettingsState {
  global: GlobalSettings;
  plugins: Record<string, PluginConfig>;

  updateGlobal: (settings: Partial<GlobalSettings>) => void;
  updateWebSearch: (config: Partial<WebSearchConfig>) => void;
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

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'en',
  theme: 'auto',
  autoSave: true,
  webSearch: DEFAULT_WEB_SEARCH_CONFIG,
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
      partialize: (state) => ({ global: state.global }),
    }
  )
);
