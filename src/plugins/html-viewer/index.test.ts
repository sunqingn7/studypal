import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { htmlViewerPlugin } from './index'
import { FileReadingService } from '../../infrastructure/file-handlers/file-reading-service'

// Mock the FileReadingService
vi.mock('../../infrastructure/file-handlers/file-reading-service', () => ({
  FileReadingService: {
    readTextFile: vi.fn(),
  },
}))

describe('HTML Viewer Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(htmlViewerPlugin.metadata).toEqual({
        id: 'html-viewer',
        name: 'HTML Viewer',
        version: '1.0.0',
        description: 'View HTML files with paginated display',
        author: 'StudyPal',
        type: 'file-handler',
      })
    })

    it('should have correct type', () => {
      expect(htmlViewerPlugin.type).toBe('file-handler')
    })

    it('should support .html and .htm extensions', () => {
      expect(htmlViewerPlugin.supportedExtensions).toContain('.html')
      expect(htmlViewerPlugin.supportedExtensions).toContain('.htm')
    })
  })

  describe('canHandle', () => {
    it('should handle .html files', () => {
      expect(htmlViewerPlugin.canHandle('/path/to/file.html')).toBe(true)
      expect(htmlViewerPlugin.canHandle('/path/to/file.HTML')).toBe(true)
    })

    it('should handle .htm files', () => {
      expect(htmlViewerPlugin.canHandle('/path/to/file.htm')).toBe(true)
      expect(htmlViewerPlugin.canHandle('/path/to/file.HTM')).toBe(true)
    })

    it('should not handle other file types', () => {
      expect(htmlViewerPlugin.canHandle('/path/to/file.pdf')).toBe(false)
      expect(htmlViewerPlugin.canHandle('/path/to/file.txt')).toBe(false)
      expect(htmlViewerPlugin.canHandle('/path/to/file')).toBe(false)
    })
  })

  describe('getFileContent', () => {
    it('should return file path as-is', async () => {
      const filePath = '/path/to/file.html'
      const result = await htmlViewerPlugin.getFileContent(filePath)
      expect(result).toBe(filePath)
    })
  })

  describe('renderFile', () => {
    it('should return HTMLViewer component', () => {
      const result = htmlViewerPlugin.renderFile('/path/to/file.html')
      expect(result).toBeDefined()
      // Component type is returned
      expect(typeof result).toBe('function')
    })
  })

  describe('extractText', () => {
    it('should extract plain text from HTML', async () => {
      const htmlContent = '<h1>Hello</h1><p>World</p>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toBe('Hello World')
    })

    it('should decode HTML entities', async () => {
      const htmlContent = '<p>&lt;tag&gt; &amp; &quot;quote&quot;</p>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toBe('<tag> & "quote"')
    })

    it('should replace multiple whitespace with single space', async () => {
      const htmlContent = '<p>Hello   world</p><p>Test   spacing</p>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toBe('Hello world Test spacing')
    })

    it('should handle complex HTML structure', async () => {
      const htmlContent = `
        <div class="container">
          <h1>Title</h1>
          <p>First paragraph with <strong>bold</strong> text.</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toContain('Title')
      expect(result).toContain('First paragraph')
      expect(result).toContain('bold')
      expect(result).toContain('Item 1')
      expect(result).toContain('Item 2')
    })

    it('should trim leading and trailing whitespace', async () => {
      const htmlContent = '  <p>Content</p>  '
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toBe('Content')
    })

    it('should return placeholder for empty content', async () => {
      const htmlContent = '<div></div>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toContain('[HTML file:')
      expect(result).toContain('no text content found')
    })

    it('should handle file read errors gracefully', async () => {
      vi.mocked(FileReadingService.readTextFile).mockRejectedValue(new Error('File not found'))

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toContain('[HTML file:')
      expect(result).toContain('error extracting text')
    })

    it('should handle &nbsp; entities', async () => {
      const htmlContent = '<p>Hello&nbsp;World</p>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toBe('Hello World')
    })

    it('should handle &#39; (single quote) entity', async () => {
      const htmlContent = '<p>It&#39;s working</p>'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue(htmlContent)

      const result = await htmlViewerPlugin.extractText('/path/to/file.html')

      expect(result).toContain("It's")
    })

    it('should preserve file path in placeholder message', async () => {
      const filePath = '/path/to/empty.html'
      vi.mocked(FileReadingService.readTextFile).mockResolvedValue('')

      const result = await htmlViewerPlugin.extractText(filePath)

      expect(result).toContain(filePath)
    })
  })

  describe('lifecycle methods', () => {
    it('should initialize without errors', async () => {
      await expect(htmlViewerPlugin.initialize()).resolves.toBeUndefined()
    })

    it('should destroy without errors', async () => {
      await expect(htmlViewerPlugin.destroy()).resolves.toBeUndefined()
    })
  })
})
