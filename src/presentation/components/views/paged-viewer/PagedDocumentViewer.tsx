import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { FileReadingService } from '../../../../infrastructure/file-handlers/file-reading-service';
import { useDocumentMetadataStore } from '../../../../application/store/document-metadata-store';
import { useFileStore } from '../../../../application/store/file-store';
import './PagedDocumentViewer.css';

interface PagedDocumentViewerProps {
  filePath: string;
  fileType: 'txt' | 'md';
  initialPage?: number;
}

export const PagedDocumentViewer: React.FC<PagedDocumentViewerProps> = ({
  filePath,
  fileType,
  initialPage = 1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPageState] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScaleState] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const metadataStore = useDocumentMetadataStore();
  const { setCurrentPage: setFileStorePage } = useFileStore();
  const hasInitialized = useRef(false);

  // Update file store when currentPage changes (to sync for file switching)
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    setFileStorePage(currentPage);
  }, [currentPage, setFileStorePage]);

  // Update page when initialPage changes (from file store)
  useEffect(() => {
    if (initialPage && initialPage !== currentPage) {
      console.log('[PagedDocumentViewer] Setting page from initialPage:', initialPage);
      setCurrentPageState(initialPage);
    }
  }, [initialPage]);

  // Load metadata when document opens - only view settings
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const metadata = await metadataStore.loadMetadata(filePath);
        if (metadata) {
          console.log('[PagedDocumentViewer] Loaded metadata:', metadata);
          if (metadata.scale && metadata.scale !== 1.0) {
            setScaleState(metadata.scale);
          }
        }
      } catch (e) {
        console.log('[PagedDocumentViewer] No metadata found, using defaults');
      }
    };
    
    loadMetadata();
  }, [filePath]);

  // Wrapped state setters to save metadata
  const setCurrentPage = useCallback((page: number | ((prev: number) => number)) => {
    setCurrentPageState((prev) => {
      const newPage = typeof page === 'function' ? page(prev) : page;
      metadataStore.updateMetadata({ currentPage: newPage });
      return newPage;
    });
  }, [metadataStore]);

  const setScale = useCallback((newScale: number | ((prev: number) => number)) => {
    setScaleState((prev) => {
      const scaleValue = typeof newScale === 'function' ? newScale(prev) : newScale;
      metadataStore.updateMetadata({ scale: scaleValue });
      return scaleValue;
    });
  }, [metadataStore]);

  // Load content
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const textContent = await FileReadingService.readTextFile(filePath);
        setContent(textContent);
      } catch (err) {
        console.error('Error loading file:', err);
        setError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [filePath]);

  // Calculate pagination after content loads and on resize
  useEffect(() => {
    if (!content || !contentRef.current || !containerRef.current) return;

    const calculatePages = () => {
      const containerHeight = containerRef.current!.clientHeight;
      const contentHeight = contentRef.current!.scrollHeight;
      
      // Calculate pages based on content height vs container height
      const pages = Math.max(1, Math.ceil(contentHeight / containerHeight));
      setTotalPages(pages);
    };

    // Calculate after render
    const timeout = setTimeout(calculatePages, 100);
    
    // Recalculate on resize
    const handleResize = () => calculatePages();
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [content, scale]);

  // Navigation
  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(3, prev + 0.1));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.5, prev - 0.1));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || error) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'PageUp':
        case 'ArrowUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'PageDown':
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          goToNextPage();
          break;
        case 'Home':
          e.preventDefault();
          setCurrentPage(1);
          break;
        case 'End':
          e.preventDefault();
          setCurrentPage(totalPages);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, error, totalPages, goToPrevPage, goToNextPage]);

  // Scroll to current page
  useEffect(() => {
    if (!contentRef.current || !containerRef.current) return;
    
    const containerHeight = containerRef.current.clientHeight;
    const scrollPosition = (currentPage - 1) * containerHeight;
    
    contentRef.current.parentElement?.scrollTo({
      top: scrollPosition,
      behavior: 'smooth',
    });
  }, [currentPage]);

  if (loading) {
    return (
      <div className="paged-viewer-loading">
        <div className="spinner"></div>
        <p>Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="paged-viewer-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="paged-viewer">
      <div className="paged-toolbar">
        <div className="paged-navigation">
          <button onClick={goToPrevPage} disabled={currentPage <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="page-indicator">
            {currentPage} / {totalPages}
          </span>
          <button onClick={goToNextPage} disabled={currentPage >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="paged-zoom">
          <button onClick={zoomOut}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn}>
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="paged-container" ref={containerRef}>
        <div 
          className="paged-content-wrapper"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div 
            className="paged-content"
            ref={contentRef}
          >
            {fileType === 'md' ? (
              <div className="markdown-content">
<ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {content}
              </ReactMarkdown>
              </div>
            ) : (
              <TextContent content={content} />
            )}
          </div>
        </div>
      </div>

      {/* Page indicator at bottom */}
      <div className="paged-footer">
        <div className="paged-progress">
          <div 
            className="paged-progress-bar"
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// Text content component
const TextContent: React.FC<{ content: string }> = ({ content }) => {
  const paragraphs = content.split('\n').filter(p => p.trim());
  
  return (
    <div className="text-document">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-paragraph">
          {paragraph}
        </p>
      ))}
    </div>
  );
};

export default PagedDocumentViewer;
