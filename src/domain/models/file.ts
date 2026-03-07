export type FileType = 'pdf' | 'txt' | 'epub' | 'web' | 'unknown'

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
    case 'md':
    case 'markdown':
      return 'txt'
    case 'epub':
      return 'epub'
    default:
      return 'unknown'
  }
}
