import { FileHandlerPlugin, PluginMetadata } from '../../domain/models/plugin';
import { HTMLViewer } from './HTMLViewer';
import { FileReadingService } from '../../infrastructure/file-handlers/file-reading-service';

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
  }

  async destroy(): Promise<void> {
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
    try {
      const htmlContent = await FileReadingService.readTextFile(filePath);
      // Extract text by removing HTML tags and decoding entities
      const textContent = htmlContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      return textContent || `[HTML file: ${filePath} - no text content found]`;
    } catch {
      return `[HTML file: ${filePath} - error extracting text]`;
    }
  }
}

export const htmlViewerPlugin = new HTMLViewerPlugin();
