import React, { useState, useEffect } from 'react';
import { FileBrowserView } from './FileBrowserView';
import { HistoryView } from './HistoryView';
import { PluginContext } from '../../domain/models/plugin';
import { Folder, Clock } from 'lucide-react';

interface SidebarTabsProps {
  context: PluginContext;
}

type TabId = 'explorer' | 'history';

export const SidebarTabs: React.FC<SidebarTabsProps> = ({ context }) => {
  const [activeTab, setActiveTab] = useState<TabId>(() => context.filePath ? 'explorer' : 'history');

  useEffect(() => {
    if (context.filePath) {
      setActiveTab('explorer');
    } else {
      setActiveTab('history');
    }
  }, [context.filePath]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'explorer', label: 'EXPLORER', icon: <Folder className="w-3 h-3" /> },
    { id: 'history', label: 'HISTORY', icon: <Clock className="w-3 h-3" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--sidebar-bg)]">
      {/* Tab Bar */}
      <div className="flex items-center h-[28px] bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 h-full text-[11px] font-semibold select-none
              transition-colors border-b-2
              ${activeTab === tab.id
                ? 'text-[var(--accent-color)] border-[var(--accent-color)] bg-[var(--sidebar-active-bg)]'
                : 'text-[var(--sidebar-fg)] border-transparent bg-[var(--sidebar-hover-bg)] hover:bg-[var(--sidebar-active-bg)]'
              }
            `}
          >
            <span className={activeTab === tab.id ? 'text-[var(--accent-color)]' : 'text-[var(--sidebar-fg)]'}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'explorer' ? (
          <FileBrowserView context={context} />
        ) : (
          <HistoryView />
        )}
      </div>
    </div>
  );
};

export default SidebarTabs;
