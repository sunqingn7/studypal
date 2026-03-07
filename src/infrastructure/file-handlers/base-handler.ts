import { FileType } from '../../domain/models/file'

export interface FileHandler {
  type: FileType
  canHandle: (filename: string) => boolean
  getContent: (path: string) => Promise<string>
  getDisplayContent?: (path: string) => Promise<unknown>
}

export interface FileHandlerRegistry {
  handlers: Map<FileType, FileHandler>
  register: (handler: FileHandler) => void
  getHandler: (type: FileType) => FileHandler | undefined
  getHandlerForFile: (filename: string) => FileHandler | undefined
}

export function createFileHandlerRegistry(): FileHandlerRegistry {
  const handlers = new Map<FileType, FileHandler>()

  return {
    handlers,

    register(handler) {
      handlers.set(handler.type, handler)
    },

    getHandler(type) {
      return handlers.get(type)
    },

    getHandlerForFile(filename) {
      for (const handler of handlers.values()) {
        if (handler.canHandle(filename)) {
          return handler
        }
      }
      return undefined
    },
  }
}
