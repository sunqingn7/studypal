import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore, FileHistoryItem } from '../../application/store/session-store';
import { useFileStore } from '../../application/store/file-store';
import { useNoteStore } from '../../application/store/note-store';
import { useAIChatStore } from '../../application/store/ai-chat-store';
import { 
  FileText,
  FileCode,
  FileImage,
  FileJson,
  FileType2,
  Clock,
  Plus,
  Trash2
} from 'lucide-react';

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500 dark:text-red-400" />;
    case 'epub':
      return <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />;
    case 'txt':
      return <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
    case 'md':
      return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'js':
    case 'jsx':
      return <FileCode className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
    case 'html':
    case 'htm':
      return <FileCode className="w-4 h-4 text-orange-500 dark:text-orange-400" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="w-4 h-4 text-purple-500 dark:text-purple-400" />;
    default:
      return <FileType2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
  }
};

const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};

const pendingFileOpens = new Set<string>();

export const HistoryView: React.FC = () => {
  const [fileHistory, setFileHistory] = useState<FileHistoryItem[]>([]);
  const { getFileHistory, clearFileHistory } = useSessionStore();
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const history = getFileHistory();
    const sorted = [...history].sort((a, b) => b.lastOpened - a.lastOpened);
    setFileHistory(sorted);
  }, [getFileHistory]);

  const handleFileClick = async (filePath: string) => {
    if (pendingFileOpens.has(filePath)) {
      return;
    }

    pendingFileOpens.add(filePath);

    try {
      const fileInfo = await invoke('open_file_from_browser', { filePath });

      if (fileInfo) {
        const event = new CustomEvent('open-file', {
          detail: fileInfo
        });
        window.dispatchEvent(event);
      }
    } catch (err) {
      console.error('Error opening file from history:', err);
    } finally {
      setTimeout(() => {
        pendingFileOpens.delete(filePath);
      }, 500);
    }
  };

  const handleNewSession = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    console.log('[HistoryView] handleNewSession called');
    if (isProcessingRef.current) {
      console.log('[HistoryView] Already processing, returning');
      return;
    }
    isProcessingRef.current = true;
    
    const confirmed = window.confirm('Create a new session? This will clear the current document and notes.');
    console.log('[HistoryView] Confirm result:', confirmed);
    if (!confirmed) {
      isProcessingRef.current = false;
      return;
    }
    
    console.log('[HistoryView] Proceeding to clear session');
    
    // Use setTimeout to ensure this happens after the dialog closes
    setTimeout(() => {
      // Get stores and clear after user confirms
      const fileStore = useFileStore.getState();
      const noteStoreActions = useNoteStore.getState();
      const aiChatStoreActions = useAIChatStore.getState();
      const sessionStore = useSessionStore.getState();
      
      // Clear current file
      fileStore.setCurrentFile(null);
      
      // Clear all notes and chats
      noteStoreActions.clear();
      aiChatStoreActions.clear();
      
      // Clear current file in session (keep history)
      sessionStore.setCurrentFile(null, null, 1, 0);
      
      // Refresh history display from store
      const history = sessionStore.getFileHistory();
      setFileHistory([...history].sort((a, b) => b.lastOpened - a.lastOpened));
      
      isProcessingRef.current = false;
    }, 100);
  };

  const handleClearHistory = () => {
    if (confirm('Clear all history?')) {
      clearFileHistory();
      setFileHistory([]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--sidebar-bg)]">
      <div className="flex items-center justify-between h-[28px] px-1 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)]">
        <span className="text-[11px] font-semibold px-2 select-none text-[var(--sidebar-fg)]">
          HISTORY
        </span>
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            onClick={handleNewSession}
            className="w-6 h-6 flex items-center justify-center rounded bg-[var(--sidebar-hover-bg)] hover:bg-[var(--sidebar-active-bg)] text-[var(--sidebar-fg)]"
            title="New Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClearHistory}
            className="w-6 h-6 flex items-center justify-center rounded bg-[var(--sidebar-hover-bg)] hover:bg-[var(--sidebar-active-bg)] text-[var(--sidebar-fg)]"
            title="Clear History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {fileHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--sidebar-fg)] opacity-50 p-4">
            <Clock className="w-8 h-8 mb-2" />
            <p className="text-sm">No history yet</p>
            <p className="text-xs mt-1">Open some files to see them here</p>
          </div>
        ) : (
          fileHistory.map((item) => (
            <div
              key={item.id}
              className="group flex items-center px-2 py-1.5 cursor-pointer hover:bg-[var(--sidebar-hover-bg)]"
              onClick={() => handleFileClick(item.path)}
            >
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mr-1.5">
                {getFileIcon(item.name)}
              </span>
              <span
                className="truncate flex-1 select-none"
                style={{ fontSize: '14px', color: 'var(--sidebar-fg)' }}
                title={item.path}
              >
                {item.name}
              </span>
              <span
                className="text-[11px] opacity-50 ml-2 flex-shrink-0"
                style={{ color: 'var(--sidebar-fg)' }}
              >
                {formatTime(item.lastOpened)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistoryView;
