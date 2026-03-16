import { pluginManager } from './plugin-manager';
import { pluginRegistry } from './plugin-registry';
import { fileBrowserViewPlugin } from '../../plugins/file-browser-view';
import { epubSupportPlugin } from '../../plugins/epub-support';
import { noteMCPServerPlugin } from '../../plugins/mcp-tools/note-mcp-plugin';
import { webSearchMCPServerPlugin } from '../../plugins/mcp-tools/web-search-mcp-plugin';
import { markdownViewerPlugin } from '../../plugins/markdown-viewer';
import { htmlViewerPlugin } from '../../plugins/html-viewer';
import { latexViewerPlugin } from '../../plugins/latex-viewer';

export async function loadAllPlugins(): Promise<void> {
  console.log('[PluginLoader] Starting plugin loading...');

  // Load built-in plugins
  const plugins = [
    { plugin: fileBrowserViewPlugin, enabled: true },
    { plugin: epubSupportPlugin, enabled: true },
    { plugin: noteMCPServerPlugin, enabled: true },
    { plugin: webSearchMCPServerPlugin, enabled: true },
    { plugin: markdownViewerPlugin, enabled: true },
    { plugin: htmlViewerPlugin, enabled: true },
    { plugin: latexViewerPlugin, enabled: true },
  ];
  
  for (const { plugin, enabled } of plugins) {
    if (enabled) {
      console.log(`[PluginLoader] Loading ${plugin.metadata.id}...`);
      const result = await pluginManager.loadPlugin(plugin, { 
        enabled: true, 
        config: {} 
      });
      
      if (result.success) {
        console.log(`[PluginLoader] ✓ ${plugin.metadata.id} loaded successfully`);
      } else {
        console.error(`[PluginLoader] ✗ ${plugin.metadata.id} failed:`, result.error);
      }
    }
  }
  
  console.log('[PluginLoader] Plugin loading complete');
  console.log('[PluginLoader] Loaded plugins:', pluginManager.getLoadedPlugins());
}

export function getPluginRegistry() {
  return pluginRegistry;
}

export function getPluginManager() {
  return pluginManager;
}

export function unloadAllPlugins(): Promise<void> {
  return pluginManager.unloadAll();
}
