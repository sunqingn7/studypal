import { FileHandler } from './base-handler'
import { FileReadingService } from './file-reading-service'

export const textFileHandler: FileHandler = {
  type: 'txt',

  canHandle(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase()
    return ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext || '')
  },

  async getContent(path: string): Promise<string> {
    return FileReadingService.readTextFile(path)
  },
}
