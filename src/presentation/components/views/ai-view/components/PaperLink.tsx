import { useState } from 'react';
import { useFileStore } from '../../../../../application/store/file-store';
import { useNoteStore } from '../../../../../application/store/note-store';
import { downloadPaper, isPaperUrl, extractPaperTitleFromMarkdown } from '../../../../../infrastructure/paper-downloader';
import { FileText, Download, Loader2 } from 'lucide-react';

interface PaperLinkProps {
  href: string;
  children: React.ReactNode;
}

export function PaperLink({ href, children }: PaperLinkProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  const { setCurrentFile } = useFileStore();
  const { createNote, updateNoteContent } = useNoteStore();

  const isPaper = isPaperUrl(href);
  const title = typeof children === 'string' ? children : extractPaperTitleFromMarkdown(href);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!isPaper) {
      // Regular link - open in browser
      window.open(href, '_blank');
      return;
    }

    // Paper link - download and open
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const result = await downloadPaper(href);
      
      // Rust returns path on success (no success field)
      if (result.path) {
        // Open the downloaded file
        setCurrentFile({
          id: result.path,
          path: result.path,
          name: result.metadata.title || title || 'Paper',
          type: 'pdf',
          size: 0
        });

        // Create a note with paper info
        const noteContent = `📄 **${result.metadata.title || title || 'Paper'}**

**Source:** ${result.metadata.url}
**File:** ${result.path}
**Size:** ${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}

${result.metadata.authors ? `**Authors:** ${result.metadata.authors.join(', ')}` : ''}
${result.metadata.year ? `**Year:** ${result.metadata.year}` : ''}

Downloaded and opened automatically.`;

        // Add note to global notes with paper info
        const note = createNote(null, result.metadata.title || 'Paper', 'note');
        updateNoteContent(note.id, noteContent);
      } else {
        setDownloadError(result.error || 'Download failed');
        console.error('Paper download failed:', result.error);
      }
    } catch (error) {
      setDownloadError('Download failed');
      console.error('Paper download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Render paper link with download icon
  if (isPaper) {
    return (
      <span className="paper-link-container">
        <FileText className="paper-icon" size={16} />
        <a 
          href={href} 
          className="paper-link"
          onClick={handleClick}
          title="Click to download and open"
        >
          {children}
        </a>
        {isDownloading ? (
          <Loader2 className="paper-action-icon spinning" size={14} />
        ) : (
          <Download className="paper-action-icon" size={14} />
        )}
        {downloadError && (
          <span className="paper-error" title={downloadError}>⚠️</span>
        )}
      </span>
    );
  }

  // Regular link
  return (
    <a 
      href={href} 
      className="markdown-link"
      target="_blank" 
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
