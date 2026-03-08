import { TypedPlugin, PluginType, PluginContext, FileHandlerPlugin, ViewPlugin, ActionPlugin, AIProviderPlugin, MCPServerPlugin } from '../../domain/models/plugin';

export class PluginRegistry {
  private plugins: Map<string, TypedPlugin> = new Map();
  private pluginsByType: Map<PluginType, TypedPlugin[]> = new Map();
  
  register(plugin: TypedPlugin): void {
    const { id } = plugin.metadata;
    
    if (this.plugins.has(id)) {
      console.warn(`Plugin ${id} is already registered. Skipping.`);
      return;
    }
    
    this.plugins.set(id, plugin);
    
    const types = Array.isArray(plugin.metadata.type) 
      ? plugin.metadata.type 
      : [plugin.metadata.type];
    
    for (const type of types) {
      if (!this.pluginsByType.has(type)) {
        this.pluginsByType.set(type, []);
      }
      this.pluginsByType.get(type)!.push(plugin);
    }
    
    console.log(`Plugin registered: ${id} (${types.join(', ')})`);
  }
  
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    this.plugins.delete(pluginId);
    
    const types = Array.isArray(plugin.metadata.type) 
      ? plugin.metadata.type 
      : [plugin.metadata.type];
    
    for (const type of types) {
      const pluginsOfType = this.pluginsByType.get(type);
      if (pluginsOfType) {
        const index = pluginsOfType.findIndex(p => p.metadata.id === pluginId);
        if (index > -1) {
          pluginsOfType.splice(index, 1);
        }
      }
    }
  }
  
  getPlugin(id: string): TypedPlugin | undefined {
    return this.plugins.get(id);
  }
  
  getPlugins(): TypedPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  getPluginsByType<T extends TypedPlugin>(type: PluginType): T[] {
    return (this.pluginsByType.get(type) || []) as T[];
  }
  
  getFileHandlers(): FileHandlerPlugin[] {
    return this.getPluginsByType<FileHandlerPlugin>('file-handler');
  }
  
  getViewPlugins(): ViewPlugin[] {
    return this.getPluginsByType<ViewPlugin>('view');
  }
  
  getActionPlugins(): ActionPlugin[] {
    return this.getPluginsByType<ActionPlugin>('action');
  }
  
  getAIProviders(): AIProviderPlugin[] {
    return this.getPluginsByType<AIProviderPlugin>('ai-provider');
  }
  
  getMCPServers(): MCPServerPlugin[] {
    return this.getPluginsByType<MCPServerPlugin>('mcp-server');
  }
  
  getFileHandlerForExtension(extension: string): FileHandlerPlugin | undefined {
    const handlers = this.getFileHandlers();
    return handlers.find(h => 
      h.supportedExtensions.includes(extension.toLowerCase()) ||
      h.canHandle(`test.${extension}`)
    );
  }
  
  getViewPluginsForContext(context: PluginContext): ViewPlugin[] {
    const views = this.getViewPlugins();
    return views.filter(v => v.canHandle(context));
  }
  
  clear(): void {
    this.plugins.clear();
    this.pluginsByType.clear();
  }
}

export const pluginRegistry = new PluginRegistry();
