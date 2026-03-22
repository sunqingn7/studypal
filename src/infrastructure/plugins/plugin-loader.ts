import { pluginManager } from './plugin-manager';
import { pluginRegistry } from './plugin-registry';
import { TypedPlugin } from '../../domain/models/plugin';
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
import { useSettingsStore } from '../../application/store/settings-store';

export async function loadAllPlugins(): Promise<void> {
  console.log('[PluginLoader] Starting plugin loading...');

  const { plugins: savedConfigs, updatePluginConfig } = useSettingsStore.getState();

  const edgeTTSPlugin = new EdgeTTSBackendPlugin();
  const qwenTTSPlugin = new QwenTTSBackendPlugin();
  const ttsMCPPlugin = new TTSMCPServerPlugin();

  const builtInPlugins: Array<{ plugin: TypedPlugin }> = [
    { plugin: fileBrowserViewPlugin },
    { plugin: epubSupportPlugin },
    { plugin: noteMCPServerPlugin },
    { plugin: webSearchMCPServerPlugin },
    { plugin: markdownViewerPlugin },
    { plugin: htmlViewerPlugin },
    { plugin: latexViewerPlugin },
    { plugin: edgeTTSPlugin },
    { plugin: qwenTTSPlugin },
    { plugin: ttsMCPPlugin },
    { plugin: classroomMCPServerPlugin },
    { plugin: classroomViewPlugin },
    { plugin: summarySkillMCPServerPlugin },
  ];
  
  for (const { plugin } of builtInPlugins) {
    const pluginId = plugin.metadata.id;
    const savedConfig = savedConfigs[pluginId];
    const enabled = savedConfig?.enabled ?? true;

    if (enabled) {
      console.log(`[PluginLoader] Loading ${pluginId}...`);
      const config = savedConfig || { enabled: true, config: {} };
      const result = await pluginManager.loadPlugin(plugin, config);
      
      if (result.success) {
        console.log(`[PluginLoader] ✓ ${pluginId} loaded successfully`);
      } else {
        console.error(`[PluginLoader] ✗ ${pluginId} failed:`, result.error);
      }
    } else {
      if (!savedConfig) {
        updatePluginConfig(pluginId, { enabled: false, config: {} });
      }
      console.log(`[PluginLoader] ⊘ ${pluginId} disabled by user`);
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
