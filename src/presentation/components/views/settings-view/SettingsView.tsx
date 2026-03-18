import { useState, useEffect } from 'react';
import { useSettingsStore, SearchProvider } from '../../../../application/store/settings-store';
import { useLLMPoolStore } from '../../../../application/store/llm-pool-store';
import { checkProviderHealth } from '../../../../application/services/llm-pool-health-check';
import { AIConfig, AIProviderType } from '../../../../domain/models/ai-context';
import { X, Globe, Search, Key, Filter, BookOpen, Server, Plus, Trash2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import './SettingsView.css';

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'webSearch' | 'llmPool' | 'plugins';

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
          className={`tab-button ${activeTab === 'llmPool' ? 'active' : ''}`}
          onClick={() => setActiveTab('llmPool')}
        >
          <Server size={18} />
          LLM Pool
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

      {activeTab === 'llmPool' && <LLMPoolTab />}

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

// LLM Pool Tab Component
function LLMPoolTab() {
  const {
    providers,
    pendingTasks,
    runningTasks,
    addProvider,
    removeProvider,
    enableProvider,
    disableProvider,
    setProviderHealth,
    getStatistics,
    updateConfig,
    config: poolConfig,
  } = useLLMPoolStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderType, setNewProviderType] = useState<AIProviderType>('llamacpp');
  const [newProviderEndpoint, setNewProviderEndpoint] = useState('');
  const [newProviderModel, setNewProviderModel] = useState('');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const [isCheckingHealth, setIsCheckingHealth] = useState<string | null>(null);
  const stats = getStatistics();

  const handleAddProvider = () => {
    if (!newProviderName.trim() || !newProviderEndpoint.trim()) return;

    const providerConfig: AIConfig = {
      provider: newProviderType,
      endpoint: newProviderEndpoint,
      model: newProviderModel || 'default',
      apiKey: newProviderApiKey || undefined,
    };

    addProvider(newProviderName.trim(), providerConfig);

    // Reset form
    setNewProviderName('');
    setNewProviderEndpoint('');
    setNewProviderModel('');
    setNewProviderApiKey('');
    setShowAddForm(false);
  };

  const handleHealthCheck = async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    setIsCheckingHealth(providerId);
    const result = await checkProviderHealth(provider);
    setProviderHealth(providerId, result.isHealthy, result.latency, result.error);
    setIsCheckingHealth(null);
  };

  const handleCheckAllHealth = async () => {
    for (const provider of providers.filter((p) => p.isEnabled)) {
      await handleHealthCheck(provider.id);
    }
  };

  return (
    <section className="settings-section">
      <h3>
        <Server size={20} />
        LLM Pool Management
      </h3>

      <div className="setting-description">
        Configure multiple LLM providers to distribute tasks across. The main LLM will act as an orchestrator,
        distributing tasks like PPT generation, quiz creation, and summarization to available workers.
      </div>

      {/* Pool Statistics */}
      <div className="pool-stats">
        <div className="stat-item">
          <span className="stat-label">Providers</span>
          <span className="stat-value">{stats.healthyProviders}/{stats.totalProviders}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Pending</span>
          <span className="stat-value">{stats.pendingTasks}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Running</span>
          <span className="stat-value">{stats.runningTasks}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{stats.completedTasks}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Failed</span>
          <span className="stat-value">{stats.failedTasks}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg Latency</span>
          <span className="stat-value">{stats.averageLatency}ms</span>
        </div>
      </div>

      {/* Pool Configuration */}
      <div className="setting-section-subtitle">
        <RefreshCw size={16} />
        Pool Configuration
      </div>

      <div className="setting-item checkbox">
        <label>
          <input
            type="checkbox"
            checked={poolConfig.randomSelection}
            onChange={(e) => updateConfig({ randomSelection: e.target.checked })}
          />
          Random selection (instead of priority-based)
        </label>
      </div>

      <div className="setting-item checkbox">
        <label>
          <input
            type="checkbox"
            checked={poolConfig.preferLowLatency}
            onChange={(e) => updateConfig({ preferLowLatency: e.target.checked })}
          />
          Prefer low-latency providers
        </label>
      </div>

      <div className="setting-row">
        <div className="setting-item">
          <label>Health Check Interval (ms)</label>
          <input
            type="number"
            value={poolConfig.healthCheckInterval}
            onChange={(e) => updateConfig({ healthCheckInterval: parseInt(e.target.value) })}
            min="5000"
            step="5000"
          />
        </div>
        <div className="setting-item">
          <label>Task Timeout (ms)</label>
          <input
            type="number"
            value={poolConfig.taskTimeout}
            onChange={(e) => updateConfig({ taskTimeout: parseInt(e.target.value) })}
            min="10000"
            step="10000"
          />
        </div>
        <div className="setting-item">
          <label>Max Retries</label>
          <input
            type="number"
            value={poolConfig.maxRetries}
            onChange={(e) => updateConfig({ maxRetries: parseInt(e.target.value) })}
            min="0"
            max="5"
          />
        </div>
      </div>

      {/* Provider List Header */}
      <div className="pool-header">
        <div className="setting-section-subtitle">
          <Server size={16} />
          Pool Providers ({providers.length})
        </div>
        <div className="pool-actions">
          <button className="icon-button" onClick={handleCheckAllHealth} title="Check All Health">
            <RefreshCw size={16} />
          </button>
          <button className="icon-button primary" onClick={() => setShowAddForm(true)} title="Add Provider">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Add Provider Form */}
      {showAddForm && (
        <div className="add-provider-form">
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                placeholder="e.g., My Llama Server"
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                value={newProviderType}
                onChange={(e) => setNewProviderType(e.target.value as AIProviderType)}
              >
              <option value="llamacpp">LLama.cpp</option>
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="vllm">vLLM</option>
              <option value="nvidia">NVIDIA NIM</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Endpoint URL</label>
              <input
                type="text"
                value={newProviderEndpoint}
                onChange={(e) => setNewProviderEndpoint(e.target.value)}
                placeholder="http://localhost:8080"
              />
            </div>
            <div className="form-group">
              <label>Model</label>
              <input
                type="text"
                value={newProviderModel}
                onChange={(e) => setNewProviderModel(e.target.value)}
                placeholder="model name"
              />
            </div>
          </div>
          {(newProviderType === 'openai' || newProviderType === 'anthropic' || newProviderType === 'custom') && (
            <div className="form-group">
              <label>API Key (optional)</label>
              <input
                type="password"
                value={newProviderApiKey}
                onChange={(e) => setNewProviderApiKey(e.target.value)}
                placeholder="Enter API key if required"
              />
            </div>
          )}
          <div className="form-actions">
            <button className="button secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button className="button primary" onClick={handleAddProvider}>
              Add to Pool
            </button>
          </div>
        </div>
      )}

      {/* Provider List */}
      <div className="provider-list">
        {providers.length === 0 ? (
          <div className="empty-providers">
            No providers in pool. Click "Add Provider" to add LLM workers.
          </div>
        ) : (
          providers.map((provider) => (
            <div key={provider.id} className={`provider-item ${provider.isHealthy ? 'healthy' : 'unhealthy'}`}>
              <div className="provider-main">
                <div className="provider-status">
                  {provider.isHealthy ? (
                    <CheckCircle size={16} className="status-healthy" />
                  ) : (
                    <XCircle size={16} className="status-unhealthy" />
                  )}
                </div>
                <div className="provider-info">
                  <div className="provider-name">{provider.name}</div>
                  <div className="provider-details">
                    {provider.config.provider} • {provider.config.endpoint} • {provider.config.model}
                    {provider.averageLatency > 0 && ` • ${provider.averageLatency}ms`}
                    {provider.currentTasks > 0 && ` • ${provider.currentTasks} tasks`}
                  </div>
                </div>
                <div className="provider-actions">
                  <button
                    className="icon-button"
                    onClick={() => handleHealthCheck(provider.id)}
                    disabled={isCheckingHealth === provider.id}
                    title="Check Health"
                  >
                    <RefreshCw size={14} className={isCheckingHealth === provider.id ? 'spinning' : ''} />
                  </button>
                  <label className="toggle small">
                    <input
                      type="checkbox"
                      checked={provider.isEnabled}
                      onChange={(e) =>
                        e.target.checked ? enableProvider(provider.id) : disableProvider(provider.id)
                      }
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <button
                    className="icon-button danger"
                    onClick={() => removeProvider(provider.id)}
                    title="Remove Provider"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Task Queue Status */}
      {(pendingTasks.length > 0 || runningTasks.length > 0) && (
        <>
          <div className="setting-section-subtitle" style={{ marginTop: '1.5rem' }}>
            <RefreshCw size={16} />
            Active Tasks
          </div>
          <div className="task-list">
            {runningTasks.map((task) => (
              <div key={task.id} className="task-item running">
                <span className="task-type">{task.type}</span>
                <span className="task-status">Running</span>
                <span className="task-provider">{providers.find((p) => p.id === task.assignedProviderId)?.name || 'Unknown'}</span>
              </div>
            ))}
            {pendingTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="task-item pending">
                <span className="task-type">{task.type}</span>
                <span className="task-status">Pending</span>
              </div>
            ))}
            {pendingTasks.length > 5 && (
              <div className="task-more">+{pendingTasks.length - 5} more pending</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
