import { FileHandlerPlugin, PluginMetadata } from '../../domain/models/plugin';
import { EPUBViewer } from './EPUBViewer';
import { invoke } from '@tauri-apps/api/core';

export class EPUBSupportPlugin implements FileHandlerPlugin {
  metadata: PluginMetadata = {
    id: 'epub-support',
    name: 'EPUB Support',
    version: '1.0.0',
    description: 'Adds support for EPUB e-book files with rendering and text extraction',
    author: 'StudyPal',
    type: 'file-handler',
  };

  type: 'file-handler' = 'file-handler';
  supportedExtensions = ['.epub'];

  async initialize(): Promise<void> {
    console.log('EPUB Support plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('EPUB Support plugin destroyed');
  }

  canHandle(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return this.supportedExtensions.some(ext => lowerPath.endsWith(ext));
  }

  async getFileContent(filePath: string): Promise<string> {
    // For EPUB, we'll extract text from all chapters
    try {
      const text = await invoke<string>('extract_epub_text', { filePath });
      return text;
    } catch (error) {
      console.error('Error extracting EPUB content:', error);
      return 'Error reading EPUB file. Please ensure the file is valid.';
    }
  }

  renderFile(_filePath: string): React.ComponentType<{ filePath: string }> | null {
    return EPUBViewer;
  }

  async extractText(filePath: string): Promise<string> {
    return this.getFileContent(filePath);
  }
}

export const epubSupportPlugin = new EPUBSupportPlugin();
