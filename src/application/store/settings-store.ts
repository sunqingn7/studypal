import { create } from 'zustand';
import { PluginConfig } from '../../domain/models/plugin';

export interface GlobalSettings {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
}

export interface SettingsState {
  global: GlobalSettings;
  plugins: Record<string, PluginConfig>;
  
  updateGlobal: (settings: Partial<GlobalSettings>) => void;
  updatePluginConfig: (pluginId: string, config: PluginConfig) => void;
  getPluginConfig: (pluginId: string) => PluginConfig | undefined;
  resetToDefaults: () => void;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'en',
  theme: 'auto',
  autoSave: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  global: DEFAULT_GLOBAL_SETTINGS,
  plugins: {},
  
  updateGlobal: (settings) => {
    set({ global: { ...get().global, ...settings } });
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
}));
