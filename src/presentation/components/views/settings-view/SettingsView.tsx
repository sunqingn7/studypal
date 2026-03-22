import { useState, useEffect, useRef } from 'react';
import { useSettingsStore, SearchProvider } from '../../../../application/store/settings-store';
import { useLLMPoolStore } from '../../../../application/store/llm-pool-store';
import { checkProviderHealth } from '../../../../application/services/llm-pool-health-check';
import { AIConfig, AIProviderType, PROVIDER_DEFAULTS } from '../../../../domain/models/ai-context';
import { PersonaRole, PERSONA_PROMPTS } from '../../../../domain/models/llm-pool';
import { fetchAvailableModels, ModelInfo } from '../../../../infrastructure/ai-providers/model-detector';
import { pluginRegistry } from '../../../../infrastructure/plugins/plugin-registry';
import { pluginManager } from '../../../../infrastructure/plugins/plugin-manager';
import { getMemoryStats, clearProviderMemory } from '../../../../application/services/provider-memory-service';
import { ttsManager } from '../../../../infrastructure/tts/tts-manager';
import { X, Globe, Search, Key, Filter, BookOpen, Server, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Loader2, Edit3, Brain, Eraser, Volume2, Play } from 'lucide-react';
import './SettingsView.css';

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'webSearch' | 'llmPool' | 'tts' | 'plugins';

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
          className={`tab-button ${activeTab === 'tts' ? 'active' : ''}`}
          onClick={() => setActiveTab('tts')}
        >
          <Volume2 size={18} />
          Text-to-Speech
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

      {activeTab === 'tts' && <TTSTab />}

      {activeTab === 'plugins' && (
        <section className="settings-section">
          <h3>
            <BookOpen size={20} />
            Plugin Configuration
          </h3>

          <div className="plugin-list">
            {(() => {
              try {
                const allPlugins = pluginRegistry.getPlugins();
                if (allPlugins.length === 0) {
                  return <div className="empty-plugins">No plugins available.</div>;
                }
                return allPlugins.map(plugin => {
                  const pluginId = plugin.metadata.id;
                  const config = plugins[pluginId];
                  const enabled = config?.enabled ?? true;
                  const isLoaded = pluginManager.isPluginLoaded(pluginId);
                  return (
                    <div key={pluginId} className={`plugin-item ${isLoaded ? 'loaded' : 'disabled'}`}>
                      <div className="plugin-header">
                        <div className="plugin-info">
                          <h4>{plugin.metadata.name}</h4>
                          <span className="plugin-id">{pluginId}</span>
                        </div>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => updatePluginConfig(pluginId, { enabled: e.target.checked, config: config?.config || {} })}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="plugin-details">
                        <p className="plugin-description">{plugin.metadata.description}</p>
                        <div className="plugin-meta">
                          <span className="plugin-version">v{plugin.metadata.version}</span>
                          <span className="plugin-author">by {plugin.metadata.author}</span>
                          {isLoaded && <span className="plugin-status loaded">Loaded</span>}
                        </div>
                      </div>
                    </div>
                  );
                });
              } catch (e) {
                return <div className="empty-plugins">Error loading plugins: {String(e)}</div>;
              }
            })()}
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
    setPrimaryProvider,
    getStatistics,
    updateConfig,
    updateProvider,
    detectCapabilities,
    config: poolConfig,
  } = useLLMPoolStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderNickname, setNewProviderNickname] = useState('');
  const [newProviderType, setNewProviderType] = useState<AIProviderType>('llamacpp');
  const [newProviderEndpoint, setNewProviderEndpoint] = useState('');
  const [newProviderModel, setNewProviderModel] = useState('');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const [newProviderPersona, setNewProviderPersona] = useState<PersonaRole>('neutral');
  const [isCheckingHealth, setIsCheckingHealth] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [memoryStats, setMemoryStats] = useState<{ providerId: string; providerName: string; ideas: number; facts: number; learnings: number; peerInsights: number }[]>([]);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [clearingMemoryId, setClearingMemoryId] = useState<string | null>(null);
  const stats = getStatistics();

  // Auto-fill defaults when provider type changes (only when NOT editing)
  useEffect(() => {
    if (editingProviderId) {
      // Don't overwrite existing values when editing
      return;
    }
    const defaults = PROVIDER_DEFAULTS[newProviderType];
    if (defaults) {
      setNewProviderEndpoint(defaults.endpoint || '');
      setNewProviderModel(defaults.model || '');
      setNewProviderApiKey('');
      setAvailableModels([]);
      setFetchError(null);
    }
  }, [newProviderType, editingProviderId]);

  // Track form interaction state to prevent unnecessary fetches
  const formInitializedRef = useRef(false);

  // Fetch models when endpoint or API key changes significantly (only after user interaction)
  useEffect(() => {
    // Don't auto-fetch if form not shown, or if editing existing provider
    if (!showAddForm || editingProviderId) {
      formInitializedRef.current = false;
      return;
    }

    // Set initialized flag after first render
    if (!formInitializedRef.current) {
      formInitializedRef.current = true;
      return;
    }

    const timeoutId = setTimeout(() => {
      // Only auto-fetch for local providers that don't need API keys
      const isLocalProvider = newProviderType === 'llamacpp' || newProviderType === 'ollama' || newProviderType === 'vllm';
      const needsExplicitFetch = newProviderApiKey || 
        newProviderEndpoint.includes('generativelanguage.googleapis.com') ||
        newProviderEndpoint.includes('openrouter.ai') ||
        newProviderEndpoint.includes('api.openai.com') ||
        newProviderEndpoint.includes('api.anthropic.com');

      // Skip auto-fetch for local providers without API key
      if (isLocalProvider && !needsExplicitFetch) {
        return;
      }

      // Only fetch if endpoint looks valid
      if (newProviderEndpoint && newProviderEndpoint.startsWith('http')) {
        fetchModels();
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [showAddForm, editingProviderId, newProviderEndpoint, newProviderApiKey, newProviderType]);

  const fetchModels = async () => {
    if (!newProviderEndpoint) return;

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      const models = await fetchAvailableModels(newProviderEndpoint, newProviderApiKey || undefined);
      setAvailableModels(models);

      // If no model selected and we have models, auto-select first one
      if (!newProviderModel && models.length > 0) {
        setNewProviderModel(models[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to fetch models');
      setAvailableModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddProvider = () => {
    if (!newProviderName.trim() || !newProviderEndpoint.trim()) return;

    const providerConfig: AIConfig = {
      provider: newProviderType,
      endpoint: newProviderEndpoint,
      model: newProviderModel || 'default',
      apiKey: newProviderApiKey || undefined,
    };

    const nickname = newProviderNickname.trim() || undefined;

    if (editingProviderId) {
      // Update existing provider
      updateProvider(editingProviderId, {
        name: newProviderName.trim(),
        nickname,
        config: providerConfig,
        personaRole: newProviderPersona,
      });
      // Re-detect capabilities since model may have changed
      detectCapabilities(editingProviderId, true).catch(err => {
        console.error('[Settings] Failed to detect capabilities for updated provider:', err);
      });
    } else {
      // Add new provider
      const newId = addProvider(newProviderName.trim(), providerConfig, nickname, newProviderPersona);
      // Detect capabilities for the new provider
      detectCapabilities(newId).catch(err => {
        console.error('[Settings] Failed to detect capabilities for new provider:', err);
      });
    }

    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setNewProviderName('');
    setNewProviderNickname('');
    setNewProviderEndpoint('');
    setNewProviderModel('');
    setNewProviderApiKey('');
    setNewProviderType('llamacpp');
    setNewProviderPersona('neutral');
    setEditingProviderId(null);
    setShowAddForm(false);
  };

  const handleEditProvider = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    setEditingProviderId(providerId);
    setNewProviderName(provider.name);
    setNewProviderNickname(provider.nickname || '');
    setNewProviderType(provider.config.provider);
    setNewProviderEndpoint(provider.config.endpoint);
    setNewProviderModel(provider.config.model);
    setNewProviderApiKey(provider.config.apiKey || '');
    setNewProviderPersona(provider.personaRole || 'neutral');
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    resetForm();
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

  const loadMemoryStats = async () => {
    setIsLoadingMemory(true);
    try {
      const stats = await getMemoryStats();
      setMemoryStats(stats);
    } catch (error) {
      console.error('[Settings] Failed to load memory stats:', error);
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const handleClearMemory = async (providerId: string, providerName: string) => {
    if (!confirm(`Clear all memory for ${providerName}? This cannot be undone.`)) {
      return;
    }
    
    setClearingMemoryId(providerId);
    try {
      await clearProviderMemory(providerId, providerName);
      await loadMemoryStats();
    } catch (error) {
      console.error('[Settings] Failed to clear memory:', error);
    } finally {
      setClearingMemoryId(null);
    }
  };

  useEffect(() => {
    loadMemoryStats();
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      loadMemoryStats();
    }
  }, [providers.length]);

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
          <button className="icon-button primary" onClick={() => { resetForm(); setShowAddForm(true); }} title="Add Provider">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Add/Edit Provider Form */}
      {showAddForm && (
        <div className="add-provider-form">
          <div className="form-header">
            <h4>{editingProviderId ? 'Edit Provider' : 'Add Provider'}</h4>
          </div>
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
            <option value="gemini">Google Gemini</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>
<div className="form-row">
                <div className="form-group">
                  <label>Nickname (for chat)</label>
                  <input
                    type="text"
                    value={newProviderNickname}
                    onChange={(e) => setNewProviderNickname(e.target.value)}
                    placeholder="e.g., G, 小g, g sen"
                  />
                  <div className="form-hint">Short name used to address this LLM in chat</div>
                </div>
                <div className="form-group">
                  <label>Persona/Role</label>
                  <select
                    value={newProviderPersona}
                    onChange={(e) => setNewProviderPersona(e.target.value as PersonaRole)}
                  >
                    {Object.entries(PERSONA_PROMPTS).map(([role, config]) => (
                      <option key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)} - {config.description}
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">How this LLM behaves in discussions</div>
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
              <label>
                Model
                {isFetchingModels && <Loader2 size={14} className="spinning inline-icon" style={{ marginLeft: '8px' }} />}
              </label>
              {availableModels.length > 0 ? (
                <select
                  value={newProviderModel}
                  onChange={(e) => setNewProviderModel(e.target.value)}
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                      {model.description && ` - ${model.description.slice(0, 50)}`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="model-input-with-fetch">
                  <input
                    type="text"
                    value={newProviderModel}
                    onChange={(e) => setNewProviderModel(e.target.value)}
                    placeholder={isFetchingModels ? 'Fetching models...' : fetchError ? 'Failed to fetch models' : 'Enter model name'}
                    disabled={isFetchingModels}
                  />
                  <button
                    className="icon-button small"
                    onClick={fetchModels}
                    disabled={isFetchingModels || !newProviderEndpoint}
                    title="Fetch available models"
                  >
                    <RefreshCw size={14} className={isFetchingModels ? 'spinning' : ''} />
                  </button>
                </div>
              )}
              {fetchError && (
                <div className="fetch-error">{fetchError}</div>
              )}
            </div>
          </div>
          {(newProviderType === 'openai' || newProviderType === 'anthropic' || newProviderType === 'nvidia' || newProviderType === 'openrouter' || newProviderType === 'gemini' || newProviderType === 'custom') && (
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
            <button className="button secondary" onClick={handleCancelEdit}>
              Cancel
            </button>
            <button className="button primary" onClick={handleAddProvider}>
              {editingProviderId ? 'Save Changes' : 'Add to Pool'}
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
                  <div className="provider-name">
                    {provider.name}
                    {provider.nickname && <span className="provider-nickname">({provider.nickname})</span>}
                    {provider.isPrimary && <span className="provider-primary-badge">Primary</span>}
                    {provider.personaRole && (
                      <span className="provider-persona-badge" title={PERSONA_PROMPTS[provider.personaRole]?.description}>
                        {provider.personaRole.charAt(0).toUpperCase() + provider.personaRole.slice(1)}
                      </span>
                    )}
                  </div>
                  <div className="provider-details">
            {provider.config.provider} • {provider.config.endpoint} • {provider.config.model}
            {provider.averageLatency > 0 && ` • ${provider.averageLatency}ms`}
            {provider.currentTasks > 0 && ` • ${provider.currentTasks} tasks`}
          </div>
          {provider.capabilities && (
            <div className="provider-capabilities">
              {provider.capabilities.supportsStreaming && <span className="capability-badge streaming" title="Streaming">STREAM</span>}
              {provider.capabilities.supportsThinking && <span className="capability-badge thinking" title="Thinking">THINK</span>}
              {provider.capabilities.supportsToolCalling && <span className="capability-badge tools" title="Tool Calling">TOOLS</span>}
              {provider.capabilities.supportsVision && <span className="capability-badge vision" title="Vision">👁</span>}
              {provider.capabilities.contextWindow > 0 && (
                <span className="capability-badge context" title="Context Window">
                  {provider.capabilities.contextWindow >= 1000000 ? `${(provider.capabilities.contextWindow / 1000000).toFixed(0)}M` : `${(provider.capabilities.contextWindow / 1000).toFixed(0)}K`}
                </span>
              )}
            </div>
          )}
          {(() => {
            const mem = memoryStats.find(m => m.providerId === provider.id);
            if (mem && (mem.ideas + mem.facts + mem.learnings + mem.peerInsights) > 0) {
              return (
                <div className="provider-memory" title={`Memory: ${mem.ideas} ideas, ${mem.facts} facts, ${mem.learnings} learnings`}>
                  <Brain size={12} />
                  <span>{mem.ideas + mem.facts + mem.learnings}</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
        <div className="provider-actions">
          <button
            className="icon-button"
            onClick={() => handleEditProvider(provider.id)}
            title="Edit Provider"
          >
            <Edit3 size={14} />
          </button>
          <button
            className="icon-button"
            onClick={() => handleHealthCheck(provider.id)}
            disabled={isCheckingHealth === provider.id}
            title="Check Health"
          >
            <RefreshCw size={14} className={isCheckingHealth === provider.id ? 'spinning' : ''} />
          </button>
          <label className="toggle small" title="Set as Primary LLM">
            <input
              type="checkbox"
              checked={provider.isPrimary}
              onChange={(e) =>
                e.target.checked ? setPrimaryProvider(provider.id) : undefined
              }
            />
            <span className="toggle-slider"></span>
          </label>
          <label className="toggle small" title="Enable/Disable">
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

      {/* Provider Memory Management */}
      <div className="setting-section-subtitle" style={{ marginTop: '1.5rem' }}>
        <Brain size={16} />
        Provider Memories
        <button className="icon-button small" onClick={loadMemoryStats} title="Refresh Memory Stats" style={{ marginLeft: '8px' }}>
          <RefreshCw size={14} className={isLoadingMemory ? 'spinning' : ''} />
        </button>
      </div>
      
      <div className="setting-description" style={{ marginBottom: '1rem' }}>
        Each provider maintains memory of ideas, facts, and learnings from discussions.
      </div>

      {memoryStats.length === 0 ? (
        <div className="empty-providers">
          No provider memories found. Memories are created when providers participate in discussions.
        </div>
      ) : (
        <div className="memory-list">
          {memoryStats.map((stat) => (
            <div key={stat.providerId} className="memory-item">
              <div className="memory-header">
                <div className="memory-provider">
                  <Brain size={14} />
                  <span className="memory-name">{stat.providerName}</span>
                </div>
                <button
                  className="icon-button small danger"
                  onClick={() => handleClearMemory(stat.providerId, stat.providerName)}
                  disabled={clearingMemoryId === stat.providerId}
                  title="Clear memory"
                >
                  <Eraser size={14} className={clearingMemoryId === stat.providerId ? 'spinning' : ''} />
                </button>
              </div>
              <div className="memory-stats">
                <div className="memory-stat">
                  <span className="memory-stat-value">{stat.ideas}</span>
                  <span className="memory-stat-label">Ideas</span>
                </div>
                <div className="memory-stat">
                  <span className="memory-stat-value">{stat.facts}</span>
                  <span className="memory-stat-label">Facts</span>
                </div>
                <div className="memory-stat">
                  <span className="memory-stat-value">{stat.learnings}</span>
                  <span className="memory-stat-label">Learnings</span>
                </div>
                <div className="memory-stat">
                  <span className="memory-stat-value">{stat.peerInsights}</span>
                  <span className="memory-stat-label">Peer Insights</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// TTS Tab Component
function TTSTab() {
  const { global, updateTTS } = useSettingsStore();
  const tts = global.tts || { defaultBackend: 'edge' as const, edge: { enabled: true, voice: 'en-US-AriaNeural', speed: 1.0 }, qwen: { enabled: false, serverUrl: 'http://localhost:8083', voice: 'Vivian', speed: 1.0, systemPrompt: '' }, system: { enabled: false, speed: 1.0 }, volume: 1.0, autoPlayInClassroom: false };
  
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isTestingTTS, setIsTestingTTS] = useState(false);
  const [testText, setTestText] = useState('Hello! This is a test of the text-to-speech system.');
  const qwenVoices = ['Vivian', 'Serena', 'Ryan', 'Aiden', 'Uncle_Fu'];

  const loadEdgeVoices = async () => {
    setIsLoadingVoices(true);
    try {
      // Load voices from Web Speech API
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices.map(v => v.name));
      } else {
        // If voices aren't loaded yet, wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));
        const voicesAfterWait = window.speechSynthesis.getVoices();
        setAvailableVoices(voicesAfterWait.map(v => v.name));
      }
    } catch (error) {
      console.error('[Settings] Failed to load TTS voices:', error);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (tts.defaultBackend === 'edge') {
      loadEdgeVoices();
    }
  }, [tts.defaultBackend]);

  const handleTestTTS = async () => {
    setIsTestingTTS(true);
    try {
      const backend = tts.defaultBackend;
      const config: any = {};
      
      if (backend === 'edge') {
        config.backend = 'edge';
        // Use saved voice (including 'auto' for language detection)
        config.voice = tts.edge?.voice || 'auto';
        config.speed = tts.edge?.speed || 1.0;
      } else if (backend === 'qwen') {
        config.backend = 'qwen';
        config.voice = tts.qwen?.voice || 'Vivian';
        config.speed = tts.qwen?.speed || 1.0;
      }
      
      console.log('[Settings] TTS Test - Backend:', backend, 'Config:', config);
      console.log('[Settings] TTS Manager available backends:', ttsManager.getAvailableBackends());
      
      await ttsManager.speak(testText, config);
    } catch (error) {
      console.error('[Settings] TTS test failed:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert('TTS test failed: ' + errorMsg + '\n\nCheck console for details.');
    } finally {
      setIsTestingTTS(false);
    }
  };

  return (
    <section className="settings-section">
      <h3>
        <Volume2 size={20} />
        Text-to-Speech Configuration
      </h3>

      <div className="setting-description">
        Configure text-to-speech for reading chat messages and classroom content aloud.
      </div>

      {/* Default Backend Selection */}
      <div className="setting-section-subtitle">
        <Filter size={16} />
        Default TTS Backend
      </div>

      <div className="setting-item">
        <div className="backend-selector">
          <label className={`backend-option ${tts.defaultBackend === 'edge' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="tts-backend"
              value="edge"
              checked={tts.defaultBackend === 'edge'}
              onChange={() => updateTTS({ defaultBackend: 'edge' })}
            />
            <div className="backend-info">
              <span className="backend-name">Microsoft Edge TTS</span>
              <span className="backend-desc">High quality neural voices, requires internet</span>
            </div>
            <div className={`backend-status ${tts.edge.enabled ? 'enabled' : ''}`}>
              {tts.edge.enabled ? 'Active' : 'Disabled'}
            </div>
          </label>
          
          <label className={`backend-option ${tts.defaultBackend === 'qwen' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="tts-backend"
              value="qwen"
              checked={tts.defaultBackend === 'qwen'}
              onChange={() => updateTTS({ defaultBackend: 'qwen' })}
            />
            <div className="backend-info">
              <span className="backend-name">Qwen TTS</span>
              <span className="backend-desc">Custom voice generation, requires Qwen TTS server</span>
            </div>
            <div className={`backend-status ${tts.qwen.enabled ? 'enabled' : ''}`}>
              {tts.qwen.enabled ? 'Active' : 'Disabled'}
            </div>
          </label>
        </div>
      </div>

      {/* Edge TTS Settings */}
      {tts.defaultBackend === 'edge' && (
        <>
          <div className="setting-section-subtitle">
            <Filter size={16} />
            Edge TTS Settings
          </div>

          <div className="setting-item">
            <label>Voice</label>
            {isLoadingVoices ? (
              <div className="loading-voices">
                <Loader2 size={14} className="spinning" />
                <span>Loading voices...</span>
              </div>
            ) : availableVoices.length > 0 ? (
              <select
                value={tts.edge.voice || 'auto'}
                onChange={(e) => updateTTS({ edge: { ...tts.edge, voice: e.target.value } })}
              >
                <option value="auto">Auto (detects language)</option>
                {availableVoices.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            ) : (
              <div className="voice-load-error">
                <span>Could not load voices. Click to retry.</span>
                <button className="icon-button small" onClick={loadEdgeVoices}>
                  <RefreshCw size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="setting-item">
            <label>Speed</label>
            <div className="range-input">
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={tts.edge.speed}
                onChange={(e) => updateTTS({ edge: { ...tts.edge, speed: parseFloat(e.target.value) } })}
              />
              <span>{tts.edge.speed.toFixed(1)}x</span>
            </div>
          </div>
        </>
      )}

      {/* Qwen TTS Settings */}
      {tts.defaultBackend === 'qwen' && (
        <>
          <div className="setting-section-subtitle">
            <Filter size={16} />
            Qwen TTS Settings
          </div>

          <div className="setting-item">
            <label>Server URL</label>
            <input
              type="text"
              value={tts.qwen.serverUrl}
              onChange={(e) => updateTTS({ qwen: { ...tts.qwen, serverUrl: e.target.value } })}
              placeholder="http://localhost:8083"
            />
            <div className="setting-hint">
              Qwen TTS server must be running at this address
            </div>
          </div>

          <div className="setting-item">
            <label>Voice</label>
            <select
              value={tts.qwen.voice}
              onChange={(e) => updateTTS({ qwen: { ...tts.qwen, voice: e.target.value } })}
            >
              {qwenVoices.map((voice) => (
                <option key={voice} value={voice}>
                  {voice.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>Speed</label>
            <div className="range-input">
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={tts.qwen.speed}
                onChange={(e) => updateTTS({ qwen: { ...tts.qwen, speed: parseFloat(e.target.value) } })}
              />
              <span>{tts.qwen.speed.toFixed(1)}x</span>
            </div>
          </div>

          <div className="setting-item">
            <label>System Prompt (Optional)</label>
            <textarea
              value={tts.qwen.systemPrompt || ''}
              onChange={(e) => updateTTS({ qwen: { ...tts.qwen, systemPrompt: e.target.value } })}
              placeholder="Additional instructions for the TTS voice (e.g., 'Speak in a warm, friendly tone')"
              rows={3}
            />
            <div className="setting-hint">
              Custom prompt to guide the TTS voice personality
            </div>
          </div>
        </>
      )}

      {/* Global Settings */}
      <div className="setting-section-subtitle">
        <Filter size={16} />
        Global Settings
      </div>

      <div className="setting-item">
        <label>Volume</label>
        <div className="range-input">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={tts.volume}
            onChange={(e) => updateTTS({ volume: parseFloat(e.target.value) })}
          />
          <span>{Math.round(tts.volume * 100)}%</span>
        </div>
      </div>

      {/* Test Section */}
      <div className="setting-section-subtitle">
        <Filter size={16} />
        Test TTS
      </div>

      <div className="setting-item">
        <label>Quick Language Tests</label>
        <div className="language-test-buttons">
          <button className="lang-test-btn" onClick={() => setTestText('Hello! This is a test of the text-to-speech system.')}>🇺🇸 English</button>
          <button className="lang-test-btn" onClick={() => setTestText('你好！这是一个文本转语音的测试。')}>🇨🇳 中文</button>
          <button className="lang-test-btn" onClick={() => setTestText('こんにちは！これは音声合成のテストです。')}>🇯🇵 日本語</button>
          <button className="lang-test-btn" onClick={() => setTestText('안녕하세요! 이것은 음성 합성 테스트입니다.')}>🇰🇷 한국어</button>
        </div>
      </div>

      <div className="setting-item">
        <label>Test Text</label>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={2}
          placeholder="Enter text to test TTS..."
        />
      </div>

      <div className="test-tts-button">
        <button
          className="button primary"
          onClick={handleTestTTS}
          disabled={isTestingTTS}
        >
          {isTestingTTS ? (
            <>
              <Loader2 size={16} className="spinning" />
              Playing...
            </>
          ) : (
            <>
              <Play size={16} />
              Test TTS
            </>
          )}
        </button>
      </div>
    </section>
  );
}
