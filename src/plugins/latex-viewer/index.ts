import { FileHandlerPlugin, PluginMetadata } from '../../domain/models/plugin';
import { LaTeXViewer } from './LaTeXViewer';

export class LaTeXViewerPlugin implements FileHandlerPlugin {
  metadata: PluginMetadata = {
    id: 'latex-viewer',
    name: 'LaTeX Viewer',
    version: '1.0.0',
    description: 'View LaTeX files with paginated display and math rendering',
    author: 'StudyPal',
    type: 'file-handler',
  };

  type: 'file-handler' = 'file-handler';
  supportedExtensions = ['.tex', '.latex'];

  async initialize(): Promise<void> {
    console.log('LaTeX Viewer plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('LaTeX Viewer plugin destroyed');
  }

  canHandle(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return this.supportedExtensions.some((ext) => lowerPath.endsWith(ext));
  }

  async getFileContent(filePath: string): Promise<string> {
    // LaTeX files are read directly by the viewer
    return filePath;
  }

  renderFile(_filePath: string): React.ComponentType<{ filePath: string }> | null {
    return LaTeXViewer;
  }

  async extractText(filePath: string): Promise<string> {
    // For text extraction, return the LaTeX source
    return `[LaTeX file: ${filePath}]`;
  }
}

export const latexViewerPlugin = new LaTeXViewerPlugin();
