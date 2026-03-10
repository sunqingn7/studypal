import React, { useRef, useCallback, useEffect, ReactNode, CSSProperties } from 'react';
import { useSelectableText } from './SelectableTextContext';
import { ContextMenu } from './ContextMenu';
import './SelectableContent.css';

interface SelectableContentProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onSelectionChange?: (text: string) => void;
}

export const SelectableContent: React.FC<SelectableContentProps> = ({
  children,
  className = '',
  style,
  onSelectionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    updateSelection,
    clearSelection,
    openContextMenu,
    closeContextMenu,
    contextMenu,
  } = useSelectableText();

  // Track selection changes
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed) {
      updateSelection({
        text: '',
        range: null,
        rect: null,
      });
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    
    if (text) {
      const rect = range.getBoundingClientRect();
      updateSelection({
        text,
        range,
        rect,
      });
      
      onSelectionChange?.(text);
    }
  }, [updateSelection, onSelectionChange]);

  // Handle context menu (right-click)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Check if there's a text selection
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || '';
      
      // Only show custom context menu if there's a selection within this container
      if (selectedText && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const clickX = e.clientX;
        const clickY = e.clientY;
        
        // Check if click is within the container
        if (
          clickX >= containerRect.left &&
          clickX <= containerRect.right &&
          clickY >= containerRect.top &&
          clickY <= containerRect.bottom
        ) {
          // Check if selection is within this container
          let node = selection?.anchorNode;
          let isWithinContainer = false;
          
          while (node) {
            if (node === containerRef.current) {
              isWithinContainer = true;
              break;
            }
            node = node.parentNode;
          }
          
          if (isWithinContainer) {
            e.preventDefault();
            openContextMenu({ x: e.clientX, y: e.clientY });
            return;
          }
        }
      }
      
      // Close any open context menu if clicking elsewhere
      if (contextMenu.isOpen) {
        closeContextMenu();
      }
    },
    [openContextMenu, closeContextMenu, contextMenu.isOpen]
  );

  // Handle copy keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+C or Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Let the browser handle the copy - our context tracks the selection
        return;
      }
      
      // Clear selection on Escape
      if (e.key === 'Escape') {
        clearSelection();
        closeContextMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, closeContextMenu]);

  // Listen for selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      
      if (selection && selection.toString().trim()) {
        // Selection exists
      } else {
        // Clear our tracked selection when browser selection is cleared
        clearSelection();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [clearSelection]);

  // Handle click to clear selection if clicking outside selection
  const handleClick = useCallback(
    () => {
      const selection = window.getSelection();
      
      // If there's no selection, close the context menu
      if (!selection || selection.isCollapsed) {
        if (contextMenu.isOpen) {
          closeContextMenu();
        }
      }
    },
    [closeContextMenu, contextMenu.isOpen]
  );

  // Handle mouse up to capture selection
  const handleMouseUp = useCallback(
    () => {
      // Small delay to allow the selection to be finalized
      setTimeout(() => {
        handleSelectionChange();
      }, 10);
    },
    [handleSelectionChange]
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`selectable-content ${className}`}
        style={style}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onKeyUp={handleSelectionChange}
      >
        {children}
      </div>
      <ContextMenu />
    </>
  );
};
