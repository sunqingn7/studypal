import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { FileReadingService } from '../../infrastructure/file-handlers/file-reading-service';
import './LaTeXViewer.css';

interface LaTeXViewerProps {
  filePath: string;
}

export const LaTeXViewer: React.FC<LaTeXViewerProps> = ({ filePath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');

  // Load content
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const latexContent = await FileReadingService.readTextFile(filePath);
        setContent(latexContent);
      } catch (err) {
        console.error('Error loading LaTeX file:', err);
        setError(`Failed to load LaTeX file: ${err instanceof Error ? err.message : String(err)}`);
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

  // Render LaTeX content with syntax highlighting
  const renderLaTeXContent = () => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Handle different LaTeX constructs
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('%')) {
        return (
          <div key={index} className="latex-comment">
            {line}
          </div>
        );
      }
      
      if (trimmedLine.startsWith('\\section') || 
          trimmedLine.startsWith('\\subsection') || 
          trimmedLine.startsWith('\\subsubsection')) {
        return (
          <div key={index} className="latex-section">
            {line}
          </div>
        );
      }
      
      if (trimmedLine.startsWith('\\begin') || trimmedLine.startsWith('\\end')) {
        return (
          <div key={index} className="latex-environment">
            {line}
          </div>
        );
      }
      
      if (trimmedLine.startsWith('\\')) {
        return (
          <div key={index} className="latex-command">
            {line}
          </div>
        );
      }
      
      return (
        <div key={index} className="latex-line">
          {line || ' '}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="latex-viewer-loading">
        <div className="spinner"></div>
        <p>Loading LaTeX...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="latex-viewer-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="latex-viewer">
      <div className="latex-toolbar">
        <div className="latex-navigation">
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
        <div className="latex-zoom">
          <button onClick={zoomOut}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn}>
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="latex-container" ref={containerRef}>
        <div
          className="latex-content-wrapper"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div className="latex-content" ref={contentRef}>
            {renderLaTeXContent()}
          </div>
        </div>
      </div>

      {/* Page indicator at bottom */}
      <div className="latex-footer">
        <div className="latex-progress">
          <div
            className="latex-progress-bar"
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default LaTeXViewer;
