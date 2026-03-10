import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface TextSelection {
  text: string;
  range: Range | null;
  rect: DOMRect | null;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface SelectableTextContextType {
  selection: TextSelection;
  contextMenu: {
    isOpen: boolean;
    position: ContextMenuPosition | null;
  };
  updateSelection: (selection: TextSelection) => void;
  clearSelection: () => void;
  openContextMenu: (position: ContextMenuPosition) => void;
  closeContextMenu: () => void;
  copySelection: () => Promise<boolean>;
}

const SelectableTextContext = createContext<SelectableTextContextType | undefined>(undefined);

export const useSelectableText = (): SelectableTextContextType => {
  const context = useContext(SelectableTextContext);
  if (!context) {
    throw new Error('useSelectableText must be used within a SelectableTextProvider');
  }
  return context;
};

interface SelectableTextProviderProps {
  children: ReactNode;
}

export const SelectableTextProvider: React.FC<SelectableTextProviderProps> = ({ children }) => {
  const [selection, setSelection] = useState<TextSelection>({
    text: '',
    range: null,
    rect: null,
  });
  
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: ContextMenuPosition | null;
  }>({
    isOpen: false,
    position: null,
  });

  const updateSelection = useCallback((newSelection: TextSelection) => {
    setSelection(newSelection);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({
      text: '',
      range: null,
      rect: null,
    });
  }, []);

  const openContextMenu = useCallback((position: ContextMenuPosition) => {
    setContextMenu({
      isOpen: true,
      position,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({
      ...prev,
      isOpen: false,
    }));
    // Delay clearing position to allow for animation
    setTimeout(() => {
      setContextMenu({
        isOpen: false,
        position: null,
      });
    }, 200);
  }, []);

  const copySelection = useCallback(async (): Promise<boolean> => {
    if (!selection.text) return false;
    
    try {
      await navigator.clipboard.writeText(selection.text);
      return true;
    } catch (err) {
      console.error('Failed to copy text:', err);
      return false;
    }
  }, [selection.text]);

  const value: SelectableTextContextType = {
    selection,
    contextMenu,
    updateSelection,
    clearSelection,
    openContextMenu,
    closeContextMenu,
    copySelection,
  };

  return (
    <SelectableTextContext.Provider value={value}>
      {children}
    </SelectableTextContext.Provider>
  );
};
