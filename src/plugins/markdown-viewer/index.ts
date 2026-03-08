import { ViewPlugin, PluginMetadata, PluginContext } from '../../domain/models/plugin';
import { MarkdownViewer } from './MarkdownViewer';

export class MarkdownViewerPlugin implements ViewPlugin {
  metadata: PluginMetadata = {
    id: 'markdown-viewer',
    name: 'Markdown Viewer',
    version: '1.0.0',
    description: 'View and render markdown files with math support',
    author: 'StudyPal',
    type: 'view',
  };

  type: 'view' = 'view';

  async initialize(): Promise<void> {
    console.log('Markdown Viewer plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('Markdown Viewer plugin destroyed');
  }

  getViewComponent() {
    return MarkdownViewer;
  }

  canHandle(context: PluginContext): boolean {
    return !!context.filePath && context.filePath.endsWith('.md');
  }

  getViewName(): string {
    return 'Markdown';
  }

  getViewIcon(): string {
    return 'file-text';
  }
}

export const markdownViewerPlugin = new MarkdownViewerPlugin();
