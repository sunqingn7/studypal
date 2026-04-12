import { useState } from 'react';
import './TranslationErrorModal.css';

interface ProviderOption {
  id: string;
  name: string;
  type: string;
}

interface TranslationErrorModalProps {
  isOpen: boolean;
  error: string;
  availableProviders: ProviderOption[];
  onRetrySame: () => void;
  onRetryWithProvider: (providerId: string) => void;
  onFallbackToGoogle: () => void;
  onCancel: () => void;
}

export function TranslationErrorModal({
  isOpen,
  error,
  availableProviders,
  onRetrySame,
  onRetryWithProvider,
  onFallbackToGoogle,
  onCancel,
}: TranslationErrorModalProps) {
  const [selectedProvider, setSelectedProvider] = useState('');

  if (!isOpen) return null;

  return (
    <div className="translation-error-modal-overlay" onClick={onCancel}>
      <div className="translation-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="translation-error-modal-header">
          <h3>Translation Failed</h3>
        </div>

        <div className="translation-error-modal-content">
          <div className="error-message">
            <p>{error}</p>
          </div>

          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={onRetrySame}
            >
              Retry with Same Provider
            </button>

            <div className="retry-with-provider">
              <select
                className="provider-select"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="">Select different provider...</option>
                {availableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.type})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => selectedProvider && onRetryWithProvider(selectedProvider)}
                disabled={!selectedProvider}
              >
                Retry with Selected
              </button>
            </div>

            <button
              className="btn btn-secondary"
              onClick={onFallbackToGoogle}
            >
              Use Google Translate
            </button>

            <button
              className="btn btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
