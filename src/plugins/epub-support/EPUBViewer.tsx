import React, { useEffect, useState, useRef } from 'react';
import ePub from 'epubjs';
import { ChevronLeft, ChevronRight, BookOpen, List, X } from 'lucide-react';

interface EPUBViewerProps {
  filePath: string;
}

interface TOCEntry {
  label: string;
  href: string;
  subitems?: TOCEntry[];
}

export const EPUBViewer: React.FC<EPUBViewerProps> = ({ filePath }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  
  const [currentLocation, setCurrentLocation] = useState<number>(0);
  const [toc, setToc] = useState<TOCEntry[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');

  useEffect(() => {
    const loadBook = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Create book instance
        const book = ePub(filePath);
        bookRef.current = book;
        
        // Wait for book to be ready
        await book.ready;
        
        // Get metadata
        const metadata = await book.loaded.metadata;
        setBookTitle(metadata.title || 'Unknown Title');
        setBookAuthor(metadata.creator || 'Unknown Author');
        
        // Get table of contents
        const navigation = await book.loaded.navigation;
        const tocData = navigation.toc || [];
        setToc(tocData);
        
        // Initialize rendition
        const rendition = book.renderTo(viewerRef.current!, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          manager: 'default'
        });
        renditionRef.current = rendition;
        
        // Display first page
        await rendition.display();
        
        // Set up location tracking
        rendition.on('locationChanged', (location: any) => {
          const current = book.locations.percentageFromCfi(location.start.cfi);
          setCurrentLocation(Math.round(current * 100));
        });
        
        // Generate locations for progress tracking
        await book.locations.generate(1024);
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading EPUB:', err);
        setError('Failed to load EPUB file. Please ensure the file is valid.');
        setLoading(false);
      }
    };
    
    loadBook();
    
    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy();
      }
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
  }, [filePath]);

  const goToPrevPage = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  const goToNextPage = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

  const goToHref = (href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
      setShowToc(false);
    }
  };

  const renderTOCEntry = (entry: TOCEntry, level: number = 0) => {
    const paddingLeft = level * 16 + 8;
    
    return (
      <div key={entry.href}>
        <button
          onClick={() => goToHref(entry.href)}
          className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {entry.label}
          </span>
        </button>
        {entry.subitems && entry.subitems.length > 0 && (
          <div>
            {entry.subitems.map(subitem => renderTOCEntry(subitem, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-pulse" />
          <p className="text-gray-600 dark:text-gray-400">Loading EPUB...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900 p-8">
        <div className="text-center max-w-md">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading EPUB</h3>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => setShowToc(!showToc)}
            className={`p-2 rounded-lg transition-colors ${
              showToc ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Table of Contents"
          >
            <List className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 ml-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate" title={bookTitle}>
              {bookTitle}
            </h2>
            {bookAuthor && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {bookAuthor}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={goToPrevPage}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[80px] text-center">
            {currentLocation}%
          </span>
          
          <button
            onClick={goToNextPage}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* TOC Sidebar */}
        {showToc && (
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-10 overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">Contents</h3>
              <button
                onClick={() => setShowToc(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-2">
              {toc.map(entry => renderTOCEntry(entry))}
            </div>
          </div>
        )}

        {/* EPUB Viewer */}
        <div 
          ref={viewerRef} 
          className="h-full w-full"
          style={{ 
            padding: '20px',
            backgroundColor: 'var(--epub-bg, #fff)'
          }}
        />
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div 
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${currentLocation}%` }}
        />
      </div>
    </div>
  );
};
