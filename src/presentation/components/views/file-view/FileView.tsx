import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useFileStore, createFileMetadata } from '../../../../application/store/file-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { useClassroomStore } from '../../../../application/store/classroom-store'
import { useTranslationStore, Lang } from '../../../../application/store/translation-store'
import { pluginRegistry } from '../../../../infrastructure/plugins/plugin-registry'
import { FileHandlerPlugin, PluginContext } from '../../../../domain/models/plugin'
import { loadPdf } from '../../../../infrastructure/file-handlers/pdf-utils'
import PDFViewer from './PDFViewer'
import PagedDocumentViewer from '../paged-viewer/PagedDocumentViewer'
import './FileView.css'
import type { FileType } from '../../../../domain/models/file'

function FileView() {
  const { currentFile, setCurrentFile, currentPage } = useFileStore()
  const { activeTopicId, addFileToTopic } = useTopicStore()
  const { startClassroom } = useClassroomStore()
  const { isActive: isTranslationActive, targetLang, toggle, setLanguages } = useTranslationStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [PluginComponent, setPluginComponent] = useState<React.ComponentType<{ filePath: string }> | null>(null)

  // Get available file handlers from plugins
  const getPluginHandler = useCallback((filePath: string): FileHandlerPlugin | undefined => {
    console.log('[FileView] Rendering with currentPage:', currentPage)
    const handlers = pluginRegistry.getFileHandlers()
    return handlers.find(h => h.canHandle(filePath))
  }, [])

  // Get available view plugins
  const getViewPlugins = useCallback((context: PluginContext) => {
    return pluginRegistry.getViewPluginsForContext(context)
  }, [])

  const loadFileWithPlugin = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)

    const handler = getPluginHandler(path)
    if (handler) {
      try {
        const Component = handler.renderFile(path)
        if (Component) {
          setPluginComponent(() => Component)
          setLoading(false)
          return
        }
      } catch (err) {
        console.error('Error loading file with plugin:', err)
        setError('Failed to load file with plugin')
      }
    } else {
      setError('No plugin available to handle this file type')
    }
    setLoading(false)
  }, [getPluginHandler])

useEffect(() => {
    if (currentFile) {
      setPluginComponent(null)
      setLoading(false)

      // Load files with dedicated plugins (EPUB, HTML, LaTeX)
      if (currentFile.type === 'epub' || currentFile.type === 'html' || currentFile.type === 'latex') {
        loadFileWithPlugin(currentFile.path)
      }
    } else {
      setPluginComponent(null)
    }
  }, [currentFile, loadFileWithPlugin])

  // Track currently opening file to prevent duplicates
  const openingFileRef = useRef<string | null>(null)

  // Listen for file-open events from plugins
  useEffect(() => {
    const handleOpenFile = async (e: Event) => {
      const customEvent = e as CustomEvent
      const fileInfo = customEvent.detail

      if (fileInfo && fileInfo.path) {
        // Prevent duplicate file opens
        if (openingFileRef.current === fileInfo.path) {
          return
        }
        openingFileRef.current = fileInfo.path

        try {
          // Small delay to ensure cleanup
          await new Promise(resolve => setTimeout(resolve, 50))

          // File info already contains everything from backend
          const metadata = createFileMetadata(fileInfo.path, fileInfo.name, fileInfo.size || 0)

          // Determine file type based on extension
          const ext = fileInfo.extension?.toLowerCase() || ''
          if (ext === 'pdf') {
            metadata.type = 'pdf'
          } else if (ext === 'epub') {
            metadata.type = 'epub'
          } else if (ext === 'md' || ext === 'markdown') {
            metadata.type = 'md'
          } else if (ext === 'html' || ext === 'htm') {
            metadata.type = 'html'
          } else if (ext === 'tex' || ext === 'latex') {
            metadata.type = 'latex'
          } else {
            metadata.type = 'txt'
          }

          setCurrentFile(metadata)

          if (activeTopicId) {
            addFileToTopic(metadata.id, activeTopicId)
          }
        } catch (err) {
          console.error('Error opening file from plugin:', err)
          setError('Failed to open file')
        } finally {
          // Clear opening ref after a delay
          setTimeout(() => {
            openingFileRef.current = null
          }, 500)
        }
      }
    }

    window.addEventListener('open-file', handleOpenFile)
    return () => window.removeEventListener('open-file', handleOpenFile)
  }, [activeTopicId, setCurrentFile, addFileToTopic])

  const handleOpenFile = async () => {
    try {
      // Build file filters from registered plugins
      const fileHandlers = pluginRegistry.getFileHandlers()
      const pluginExtensions = fileHandlers.flatMap(h => h.supportedExtensions)

      const selected = await open({
        multiple: false,
        filters: [
{
        name: 'All Supported Files',
        extensions: ['pdf', 'txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'htm', 'tex', 'css', 'epub', ...pluginExtensions.map(e => e.replace('.', ''))],
      },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'LaTeX', extensions: ['tex'] },
      { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'css'] },
          ...fileHandlers.map(h => ({
            name: `${h.metadata.name}`,
            extensions: h.supportedExtensions.map(e => e.replace('.', '')),
          })),
        ],
      })

      if (selected && typeof selected === 'string') {
        const path = selected
        const name = path.split(/[/\\]/).pop() || 'unknown'
        const ext = name.split('.').pop()?.toLowerCase() || ''

let fileType: FileType
      if (ext === 'pdf') fileType = 'pdf'
      else if (ext === 'epub') fileType = 'epub'
      else if (ext === 'md' || ext === 'markdown') fileType = 'md'
      else if (ext === 'html' || ext === 'htm') fileType = 'html'
      else if (ext === 'tex' || ext === 'latex') fileType = 'latex'
      else fileType = 'txt'

        const metadata = createFileMetadata(path, name, 0)
        metadata.type = fileType

        setCurrentFile(metadata)

        if (activeTopicId) {
          addFileToTopic(metadata.id, activeTopicId)
        }
      }
    } catch (err) {
      console.error('Error opening file:', err)
      setError('Failed to open file')
    }
  }

  // Get view plugins for current context
  const viewPlugins = useMemo(() => {
    if (!currentFile) return []
    const context: PluginContext = { filePath: currentFile.path }
    return getViewPlugins(context)
  }, [currentFile, getViewPlugins])

  const handleStartClassroom = async () => {
    if (!currentFile) {
      // Need to open a file first
      await handleOpenFile()
      return
    }
    
    // Get file content for classroom
    try {
      const { FileReadingService } = await import('../../../../infrastructure/file-handlers/file-reading-service')
      const { getCurrentPageText } = await import('../../../../infrastructure/file-handlers/pdf-utils')
      
      let content = ''
      let totalPages = 1
      
      // Save current file page before entering classroom
      const currentFilePage = currentPage || 1
      const scrollPosition = 0 // We don't have scroll tracking yet, use 0 as default
      
      if (currentFile.type === 'pdf') {
        // For PDFs, load the document to get page count and extract first page text
        const pdf = await loadPdf(currentFile.path)
        totalPages = pdf.numPages
        content = await getCurrentPageText(currentFile.path, 1)
      } else {
        // For text files, read content normally
        const fileResult = await FileReadingService.readFile(currentFile.path)
        content = fileResult.textContent || ''
        totalPages = 1 // For text files, treat as single page
      }
      
      startClassroom(currentFile.path, content, totalPages, currentFilePage, scrollPosition)
    } catch (err) {
      console.error('Failed to start classroom mode:', err)
      setError('Failed to start classroom mode')
    }
  }

  const renderContent = () => {
    if (!currentFile) {
      return (
        <div className="file-view-empty">
          <div className="empty-icon">📄</div>
          <h3>No file open</h3>
          <p>Open a PDF, EPUB, or text file to start studying</p>
          <div className="file-view-actions">
            <button className="open-button" onClick={handleOpenFile}>
              Open File
            </button>
          </div>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="file-view-loading">
          <div className="spinner"></div>
          <p>Loading file...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="file-view-error">
          <p>{error}</p>
          <button onClick={handleOpenFile}>Try another file</button>
        </div>
      )
    }

      // Render plugin component if available (for EPUB)
      if (PluginComponent) {
        return <PluginComponent filePath={currentFile.path} />
      }

      // Default viewers - always read fresh from disk
      if (currentFile.type === 'pdf') {
        return <PDFViewer path={currentFile.path} initialPage={currentPage} />
      }

      // Use paged view for all other file types (TXT, EPUB fallback)
      // Check if it's a markdown file by extension
      const isMarkdown = currentFile.name.toLowerCase().endsWith('.md') || 
                        currentFile.name.toLowerCase().endsWith('.markdown')
      return <PagedDocumentViewer 
        filePath={currentFile.path} 
        fileType={isMarkdown ? 'md' : 'txt'}
        initialPage={currentPage}
      />
  }

  return (
    <div className="view-container file-view">
      <div className="view-header">
        <span className="file-title">
          {currentFile ? currentFile.name : 'File View'}
        </span>
        <div className="header-actions">
          {viewPlugins.length > 0 && (
            <select className="view-selector">
              <option value="default">Default View</option>
              {viewPlugins.map(plugin => (
                <option key={plugin.metadata.id} value={plugin.metadata.id}>
                  {plugin.getViewName()}
                </option>
              ))}
            </select>
          )}
          {currentFile && (
            <button 
              className="header-button classroom-btn" 
              onClick={handleStartClassroom} 
              title="Enter Classroom Mode"
            >
              🎓 Classroom
            </button>
          )}
          {currentFile && (
            <button 
              className={`header-button translation-btn ${isTranslationActive ? 'active' : ''}`}
              onClick={toggle}
              title="Toggle Translation Mode"
            >
              🌐 Translation {isTranslationActive ? 'ON' : 'OFF'}
            </button>
          )}
          {isTranslationActive && (
            <select 
              className="lang-selector"
              value={targetLang}
              onChange={(e) => setLanguages('en', e.target.value as Lang)}
              title="Select target language"
            >
              <option value="zh">EN → CN</option>
              <option value="en">CN → EN</option>
            </select>
          )}
          <button className="header-button" onClick={handleOpenFile} title="Open File">
            📂
          </button>
        </div>
      </div>
      <div className="view-content file-view-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default FileView
