import { TypedPlugin, PluginConfig } from '../../domain/models/plugin';
import { pluginRegistry } from './plugin-registry';

export interface PluginLoadResult {
  success: boolean;
  pluginId?: string;
  error?: string;
}

export class PluginManager {
  private configs: Map<string, PluginConfig> = new Map();
  private loadedPlugins: Set<string> = new Set();
  
  async loadPlugin(plugin: TypedPlugin, config?: PluginConfig): Promise<PluginLoadResult> {
    const { id } = plugin.metadata;
    
    try {
      if (plugin.metadata.dependencies) {
        for (const dep of plugin.metadata.dependencies) {
          if (!this.loadedPlugins.has(dep)) {
            return {
              success: false,
              pluginId: id,
              error: `Missing dependency: ${dep}`
            };
          }
        }
      }
      
      const mergedConfig = config?.config || {};
      await plugin.initialize(mergedConfig);
      
      pluginRegistry.register(plugin);
      this.loadedPlugins.add(id);
      
      if (config) {
        this.configs.set(id, config);
      }
      
      return { success: true, pluginId: id };
    } catch (error) {
      return {
        success: false,
        pluginId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = pluginRegistry.getPlugin(pluginId);
    if (plugin) {
      await plugin.destroy();
      pluginRegistry.unregister(pluginId);
      this.loadedPlugins.delete(pluginId);
      this.configs.delete(pluginId);
    }
  }
  
  async reloadPlugin(pluginId: string): Promise<PluginLoadResult> {
    const plugin = pluginRegistry.getPlugin(pluginId);
    const config = this.configs.get(pluginId);
    
    if (!plugin) {
      return {
        success: false,
        pluginId,
        error: 'Plugin not found'
      };
    }
    
    await this.unloadPlugin(pluginId);
    return this.loadPlugin(plugin as TypedPlugin, config);
  }
  
  getPluginConfig(pluginId: string): PluginConfig | undefined {
    return this.configs.get(pluginId);
  }
  
  async updatePluginConfig(pluginId: string, config: PluginConfig): Promise<void> {
    const plugin = pluginRegistry.getPlugin(pluginId);
    if (plugin && plugin.setConfig) {
      plugin.setConfig(config.config);
    }
    this.configs.set(pluginId, config);
  }
  
  getLoadedPlugins(): string[] {
    return Array.from(this.loadedPlugins);
  }
  
  isPluginLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }
  
  async unloadAll(): Promise<void> {
    const plugins = Array.from(this.loadedPlugins);
    for (const pluginId of plugins) {
      await this.unloadPlugin(pluginId);
    }
  }
}

export const pluginManager = new PluginManager();
