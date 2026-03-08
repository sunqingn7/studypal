import React, { useState, useEffect, useCallback } from 'react';
import { pluginRegistry } from '../../../infrastructure/plugins/plugin-registry';
import { ViewPlugin, PluginContext } from '../../../domain/models/plugin';
import { X } from 'lucide-react';

interface PluginPanelProps {
  context: PluginContext;
  defaultView?: React.ReactNode;
  className?: string;
}

export const PluginPanel: React.FC<PluginPanelProps> = ({ 
  context, 
  defaultView,
  className = ''
}) => {
  const [availableViews, setAvailableViews] = useState<ViewPlugin[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const updateAvailableViews = useCallback(() => {
    const views = pluginRegistry.getViewPluginsForContext(context);
    setAvailableViews(views);
    
    // Set first view as active if none selected
    if (views.length > 0 && !activeViewId) {
      setActiveViewId(views[0].metadata.id);
      setIsVisible(true);
    } else if (views.length === 0) {
      setIsVisible(false);
      setActiveViewId(null);
    }
  }, [context, activeViewId]);

  useEffect(() => {
    updateAvailableViews();
    
    // Subscribe to plugin changes
    const interval = setInterval(updateAvailableViews, 1000);
    return () => clearInterval(interval);
  }, [updateAvailableViews]);

  const handleViewChange = (viewId: string) => {
    setActiveViewId(viewId);
  };

  const handleClose = () => {
    setIsVisible(false);
    setActiveViewId(null);
  };

  const activeView = availableViews.find(v => v.metadata.id === activeViewId);
  const ActiveViewComponent = activeView?.getViewComponent();

  // If no views available, return default
  if (!isVisible || availableViews.length === 0) {
    return <>{defaultView}</>;
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* View Selector Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Plugin View:
          </span>
          <select
            value={activeViewId || ''}
            onChange={(e) => handleViewChange(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          >
            {availableViews.map(view => (
              <option key={view.metadata.id} value={view.metadata.id}>
                {view.getViewName()}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          {availableViews.length > 1 && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Close plugin view"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Plugin View Content */}
      <div className="flex-1 overflow-auto">
        {ActiveViewComponent ? (
          <ActiveViewComponent context={context} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a view</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginPanel;
