import { pluginManager } from './plugin-manager';
import { pluginRegistry } from './plugin-registry';
import { fileBrowserViewPlugin } from '../../plugins/file-browser-view';
import { epubSupportPlugin } from '../../plugins/epub-support';
import { noteMCPServerPlugin } from '../../plugins/mcp-tools/note-mcp-plugin';
import { webSearchMCPServerPlugin } from '../../plugins/mcp-tools/web-search-mcp-plugin';
import { markdownViewerPlugin } from '../../plugins/markdown-viewer';
import { htmlViewerPlugin } from '../../plugins/html-viewer';
import { latexViewerPlugin } from '../../plugins/latex-viewer';
import { EdgeTTSBackendPlugin } from '../../plugins/tts-backends/edge-tts-backend';
import { QwenTTSBackendPlugin } from '../../plugins/tts-backends/qwen-tts-backend';
import { TTSMCPServerPlugin } from '../../plugins/mcp-tools/tts-mcp-plugin';
import { classroomMCPServerPlugin } from '../../plugins/mcp-tools/classroom-mcp-plugin';
import { classroomViewPlugin } from '../../plugins/classroom-view';
import { summarySkillMCPServerPlugin } from '../../plugins/mcp-tools/summary-skill-plugin';

export async function loadAllPlugins(): Promise<void> {
  console.log('[PluginLoader] Starting plugin loading...');

  // Initialize TTS backends and register with manager
  const edgeTTSPlugin = new EdgeTTSBackendPlugin();
  const qwenTTSPlugin = new QwenTTSBackendPlugin();
  const ttsMCPPlugin = new TTSMCPServerPlugin();

  // Load built-in plugins
  const plugins = [
    { plugin: fileBrowserViewPlugin, enabled: true },
    { plugin: epubSupportPlugin, enabled: true },
    { plugin: noteMCPServerPlugin, enabled: true },
    { plugin: webSearchMCPServerPlugin, enabled: true },
    { plugin: markdownViewerPlugin, enabled: true },
    { plugin: htmlViewerPlugin, enabled: true },
    { plugin: latexViewerPlugin, enabled: true },
    { plugin: edgeTTSPlugin, enabled: true },
    { plugin: qwenTTSPlugin, enabled: true },
    { plugin: ttsMCPPlugin, enabled: true },
    { plugin: classroomMCPServerPlugin, enabled: true },
    { plugin: classroomViewPlugin, enabled: true },
    { plugin: summarySkillMCPServerPlugin, enabled: true },
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
