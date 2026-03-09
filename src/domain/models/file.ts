export type FileType = 'pdf' | 'txt' | 'md' | 'epub' | 'html' | 'latex' | 'web' | 'unknown'

export interface FileMetadata {
  id: string
  name: string
  path: string
  type: FileType
  size: number
  lastOpened?: number
}

export interface FileState {
  currentFile: FileMetadata | null
  fileHistory: FileMetadata[]
}

export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'pdf'
    case 'txt':
      return 'txt'
    case 'md':
    case 'markdown':
      return 'md'
    case 'epub':
      return 'epub'
    case 'html':
    case 'htm':
      return 'html'
    case 'tex':
    case 'latex':
      return 'latex'
    default:
      return 'unknown'
  }
}
