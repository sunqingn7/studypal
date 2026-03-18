import { useState, useEffect } from 'react';
import { useSettingsStore, SearchProvider } from '../../../../application/store/settings-store';
import { X, Globe, Search, Key, Filter, BookOpen } from 'lucide-react';
import './SettingsView.css';

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'webSearch' | 'plugins';

const PROVIDER_OPTIONS: { value: SearchProvider; label: string; requiresKey: boolean }[] = [
  { value: 'duckduckgo', label: 'DuckDuckGo (Free)', requiresKey: false },
  { value: 'brave', label: 'Brave Search', requiresKey: true },
  { value: 'tavily', label: 'Tavily', requiresKey: true },
  { value: 'serper', label: 'Serper (Google)', requiresKey: true },
];

export function SettingsView({ isOpen, onClose }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('webSearch');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const { 
    global, 
    updateGlobal, 
    updateWebSearch,
    plugins,
    updatePluginConfig 
  } = useSettingsStore();

  useEffect(() => {
    if (!isOpen) {
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);
    
    try {
      // Simple test - try to search for "test"
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('search_web', {
        query: 'test',
        provider: global.webSearch.provider,
        apiKey: global.webSearch.provider === 'duckduckgo' ? undefined : global.webSearch.apiKey,
        maxResults: 1
      });
      
      setTestResult({ success: true, message: 'Connection successful!' });
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Connection failed' 
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const currentProvider = PROVIDER_OPTIONS.find(p => p.value === global.webSearch.provider);

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-sidebar">
            <button
              className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <Globe size={18} />
              General
            </button>
            <button
              className={`tab-button ${activeTab === 'webSearch' ? 'active' : ''}`}
              onClick={() => setActiveTab('webSearch')}
            >
              <Search size={18} />
              Web Search
            </button>
            <button
              className={`tab-button ${activeTab === 'plugins' ? 'active' : ''}`}
              onClick={() => setActiveTab('plugins')}
            >
              <BookOpen size={18} />
              Plugins
            </button>
          </div>

          <div className="settings-panel">
            {activeTab === 'general' && (
              <section className="settings-section">
                <h3>General Settings</h3>
                
                <div className="setting-item">
                  <label>Theme</label>
                  <select 
                    value={global.theme}
                    onChange={(e) => updateGlobal({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
                  >
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                <div className="setting-item">
                  <label>Language</label>
                  <select 
                    value={global.language}
                    onChange={(e) => updateGlobal({ language: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </div>

                <div className="setting-item checkbox">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={global.autoSave}
                      onChange={(e) => updateGlobal({ autoSave: e.target.checked })}
                    />
                    Auto-save documents
                  </label>
                </div>
              </section>
            )}

            {activeTab === 'webSearch' && (
              <section className="settings-section">
                <h3>
                  <Search size={20} />
                  Web Search Configuration
                </h3>
                
                <div className="setting-description">
                  Configure your preferred search provider for web search and paper discovery.
                </div>

                <div className="setting-item">
                  <label>
                    <Globe size={16} />
                    Search Provider
                  </label>
                  <select 
                    value={global.webSearch.provider}
                    onChange={(e) => {
                      updateWebSearch({ provider: e.target.value as SearchProvider });
                      setTestResult(null);
                    }}
                  >
                    {PROVIDER_OPTIONS.map(p => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {currentProvider?.requiresKey && (
                  <div className="setting-item">
                    <label>
                      <Key size={16} />
                      API Key
                    </label>
                    <div className="api-key-input">
                      <input 
                        type="password"
                        value={global.webSearch.apiKey || ''}
                        onChange={(e) => {
                          updateWebSearch({ apiKey: e.target.value });
                          setTestResult(null);
                        }}
                        placeholder={`Enter your ${currentProvider.label} API key`}
                      />
                    </div>
                    <div className="setting-hint">
                      Your API key is stored locally and never shared.
                    </div>
                  </div>
                )}

                <div className="setting-item">
                  <label>
                    <Filter size={16} />
                    Default Max Results
                  </label>
                  <div className="range-input">
                    <input 
                      type="range" 
                      min="1" 
                      max="50" 
                      value={global.webSearch.maxResults}
                      onChange={(e) => updateWebSearch({ maxResults: parseInt(e.target.value) })}
                    />
                    <span>{global.webSearch.maxResults}</span>
                  </div>
                </div>

                <div className="setting-item">
                  <label>Default Query Type</label>
                  <select 
                    value={global.webSearch.defaultQueryType}
                    onChange={(e) => updateWebSearch({ defaultQueryType: e.target.value as 'general' | 'academic' | 'news' })}
                  >
                    <option value="general">General</option>
                    <option value="academic">Academic</option>
                    <option value="news">News</option>
                  </select>
                </div>

                <div className="setting-section-subtitle">
                  <Filter size={16} />
                  Academic Filters
                </div>

                <div className="setting-item checkbox">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={global.webSearch.academicFilters.pdfOnly}
                      onChange={(e) => updateWebSearch({ 
                        academicFilters: { 
                          ...global.webSearch.academicFilters, 
                          pdfOnly: e.target.checked 
                        } 
                      })}
                    />
                    PDF-only mode (prioritize papers and documents)
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-item">
                    <label>Year From</label>
                    <input 
                      type="number" 
                      value={global.webSearch.academicFilters.yearFrom || ''}
                      onChange={(e) => updateWebSearch({ 
                        academicFilters: { 
                          ...global.webSearch.academicFilters, 
                          yearFrom: e.target.value ? parseInt(e.target.value) : undefined 
                        } 
                      })}
                      placeholder="e.g., 2020"
                      min="1900"
                      max={new Date().getFullYear()}
                    />
                  </div>

                  <div className="setting-item">
                    <label>Year To</label>
                    <input 
                      type="number" 
                      value={global.webSearch.academicFilters.yearTo || ''}
                      onChange={(e) => updateWebSearch({ 
                        academicFilters: { 
                          ...global.webSearch.academicFilters, 
                          yearTo: e.target.value ? parseInt(e.target.value) : undefined 
                        } 
                      })}
                      placeholder="e.g., 2024"
                      min="1900"
                      max={new Date().getFullYear()}
                    />
                  </div>
                </div>

                <div className="test-connection">
                  <button 
                    className="test-button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || (currentProvider?.requiresKey && !global.webSearch.apiKey)}
                  >
                    {isTestingConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  
                  {testResult && (
                    <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                      {testResult.success ? '✓' : '✗'} {testResult.message}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'plugins' && (
              <section className="settings-section">
                <h3>
                  <BookOpen size={20} />
                  Plugin Configuration
                </h3>
                
                <div className="plugin-list">
                  {Object.entries(plugins).length === 0 ? (
                    <div className="empty-plugins">
                      No plugins configured yet.
                    </div>
                  ) : (
                    Object.entries(plugins).map(([id, config]) => (
                      <div key={id} className="plugin-item">
                        <div className="plugin-header">
                          <h4>{id}</h4>
                          <label className="toggle">
                            <input 
                              type="checkbox" 
                              checked={config.enabled}
                              onChange={(e) => updatePluginConfig(id, { ...config, enabled: e.target.checked })}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                        {config.config && (
                          <div className="plugin-config">
                            <pre>{JSON.stringify(config.config, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
