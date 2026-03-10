import React, { useEffect, useRef } from 'react';
import { Copy, Search, Quote, MessageSquare } from 'lucide-react';
import { useSelectableText } from './SelectableTextContext';
import './ContextMenu.css';

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export const ContextMenu: React.FC = () => {
  const { contextMenu, closeContextMenu, copySelection, selection } = useSelectableText();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.isOpen, closeContextMenu]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [contextMenu.isOpen, closeContextMenu]);

  const handleCopy = async () => {
    const success = await copySelection();
    if (success) {
      closeContextMenu();
      // Show toast notification (we can add this later)
      console.log('Text copied to clipboard');
    }
  };

  const handleSearch = () => {
    // Open search in AI view with selected text
    // This can be implemented later
    console.log('Search selected text:', selection.text);
    closeContextMenu();
  };

  const handleQuote = () => {
    // Add to notes with quote formatting
    console.log('Quote selected text:', selection.text);
    closeContextMenu();
  };

  const handleAskAI = () => {
    // Send selected text to AI chat
    console.log('Ask AI about:', selection.text);
    closeContextMenu();
  };

  const menuItems: ContextMenuItem[] = [
    {
      id: 'copy',
      label: 'Copy',
      icon: <Copy size={16} />,
      shortcut: '⌘C',
      onClick: handleCopy,
      disabled: !selection.text,
    },
    {
      id: 'divider1',
      label: '',
      onClick: () => {},
      divider: true,
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search size={16} />,
      onClick: handleSearch,
      disabled: !selection.text,
    },
    {
      id: 'quote',
      label: 'Add to Notes',
      icon: <Quote size={16} />,
      onClick: handleQuote,
      disabled: !selection.text,
    },
    {
      id: 'ask-ai',
      label: 'Ask AI',
      icon: <MessageSquare size={16} />,
      onClick: handleAskAI,
      disabled: !selection.text,
    },
  ];

  if (!contextMenu.isOpen || !contextMenu.position) {
    return null;
  }

  // Calculate position to keep menu within viewport
  const calculatePosition = (): React.CSSProperties => {
    const menuWidth = 200;
    const menuHeight = 200;
    const padding = 10;
    
    let { x, y } = contextMenu.position!;
    
    // Adjust if menu would go off screen
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = y - menuHeight;
    }
    
    return {
      left: x,
      top: y,
    };
  };

  return (
    <div
      ref={menuRef}
      className={`context-menu ${contextMenu.isOpen ? 'open' : ''}`}
      style={calculatePosition()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menuItems.map((item) => (
        item.divider ? (
          <div key={item.id} className="context-menu-divider" />
        ) : (
          <button
            key={item.id}
            className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={item.onClick}
            disabled={item.disabled}
          >
            {item.icon && (
              <span className="context-menu-icon">{item.icon}</span>
            )}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        )
      ))}
    </div>
  );
};
