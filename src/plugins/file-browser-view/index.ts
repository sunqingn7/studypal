import { ViewPlugin, PluginMetadata, PluginContext } from '../../domain/models/plugin';
import { FileBrowserView } from './FileBrowserView';

export class FileBrowserViewPlugin implements ViewPlugin {
  metadata: PluginMetadata = {
    id: 'file-browser-view',
    name: 'File Browser View',
    version: '1.0.0',
    description: 'Displays the file system structure of the folder containing the opened file',
    author: 'StudyPal',
    type: 'view',
  };

  type: 'view' = 'view';

  async initialize(): Promise<void> {
    console.log('File Browser View plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('File Browser View plugin destroyed');
  }

  getViewComponent() {
    return FileBrowserView;
  }

  canHandle(context: PluginContext): boolean {
    return !!context.filePath;
  }

  getViewName(): string {
    return 'File Browser';
  }

  getViewIcon(): string {
    return 'folder-tree';
  }
}

export const fileBrowserViewPlugin = new FileBrowserViewPlugin();
