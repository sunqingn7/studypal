import { FileHandlerPlugin, PluginMetadata } from '../../domain/models/plugin';
import { HTMLViewer } from './HTMLViewer';

export class HTMLViewerPlugin implements FileHandlerPlugin {
  metadata: PluginMetadata = {
    id: 'html-viewer',
    name: 'HTML Viewer',
    version: '1.0.0',
    description: 'View HTML files with paginated display',
    author: 'StudyPal',
    type: 'file-handler',
  };

  type: 'file-handler' = 'file-handler';
  supportedExtensions = ['.html', '.htm'];

  async initialize(): Promise<void> {
    console.log('HTML Viewer plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('HTML Viewer plugin destroyed');
  }

  canHandle(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return this.supportedExtensions.some((ext) => lowerPath.endsWith(ext));
  }

  async getFileContent(filePath: string): Promise<string> {
    // HTML files are read directly by the viewer
    return filePath;
  }

  renderFile(_filePath: string): React.ComponentType<{ filePath: string }> | null {
    return HTMLViewer;
  }

  async extractText(filePath: string): Promise<string> {
    // For text extraction, we could parse HTML and return text content
    // For now, return a placeholder
    return `[HTML file: ${filePath}]`;
  }
}

export const htmlViewerPlugin = new HTMLViewerPlugin();
