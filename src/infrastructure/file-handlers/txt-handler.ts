import { readTextFile } from '@tauri-apps/plugin-fs'
import { FileHandler } from './base-handler'

export const textFileHandler: FileHandler = {
  type: 'txt',

  canHandle(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase()
    return ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext || '')
  },

  async getContent(path: string): Promise<string> {
    const content = await readTextFile(path)
    return content
  },
}
