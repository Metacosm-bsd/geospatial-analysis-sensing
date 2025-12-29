/**
 * API Keys Panel Component
 * Sprint 49-54: Public API
 *
 * Manages API key creation, listing, and revocation.
 */

import { useState } from 'react';
import type { ApiKey, CreateApiKeyInput } from './types';
import { API_SCOPES, TIER_LIMITS } from './types';

interface ApiKeysPanelProps {
  apiKeys: ApiKey[];
  onCreateKey: (input: CreateApiKeyInput) => Promise<ApiKey>;
  onRevokeKey: (keyId: string) => Promise<void>;
  onRegenerateKey: (keyId: string) => Promise<ApiKey>;
  onToggleActive: (keyId: string, isActive: boolean) => Promise<void>;
}

export function ApiKeysPanel({
  apiKeys,
  onCreateKey,
  onRevokeKey,
  onRegenerateKey,
  onToggleActive,
}: ApiKeysPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateApiKeyInput>({
    name: '',
    scopes: Object.keys(API_SCOPES),
  });

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const key = await onCreateKey(createForm);
      setNewKey(key);
      setCreateForm({ name: '', scopes: Object.keys(API_SCOPES) });
    } catch (error) {
      console.error('Failed to create API key:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyKey = () => {
    if (newKey?.secretKey) {
      navigator.clipboard.writeText(newKey.secretKey);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your API keys for programmatic access
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create API Key
        </button>
      </div>

      {/* New Key Display */}
      {newKey?.secretKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="font-medium text-green-800">API Key Created</h4>
              <p className="text-sm text-green-700 mt-1">
                Copy your API key now. You won't be able to see it again!
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded font-mono text-sm break-all">
                  {newKey.secretKey}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="px-3 py-2 text-green-700 hover:bg-green-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="mt-3 text-sm text-green-700 hover:underline"
              >
                I've saved my key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {apiKeys.map((key) => (
              <tr key={key.id} className="hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="font-medium text-gray-900">{key.name}</div>
                  <div className="text-xs text-gray-500">{key.scopes.length} scopes</div>
                </td>
                <td className="px-4 py-4">
                  <code className="text-sm text-gray-600">{key.keyPrefix}...</code>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    key.tier === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700' :
                    key.tier === 'PROFESSIONAL' ? 'bg-blue-100 text-blue-700' :
                    key.tier === 'STARTER' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {key.tier}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">
                  {formatDate(key.lastUsedAt)}
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => onToggleActive(key.id, !key.isActive)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                      key.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${key.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                    {key.isActive ? 'Active' : 'Disabled'}
                  </button>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onRegenerateKey(key.id)}
                      className="p-1 text-gray-400 hover:text-blue-600 rounded"
                      title="Regenerate key"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRevokeKey(key.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Revoke key"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No API keys yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Create API Key</h3>
            </div>
            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Production API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Scopes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Permissions
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {Object.entries(API_SCOPES).map(([scope, description]) => (
                    <label key={scope} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={createForm.scopes?.includes(scope)}
                        onChange={(e) => {
                          const newScopes = e.target.checked
                            ? [...(createForm.scopes || []), scope]
                            : (createForm.scopes || []).filter((s) => s !== scope);
                          setCreateForm({ ...createForm, scopes: newScopes });
                        }}
                        className="rounded text-blue-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{scope}</div>
                        <div className="text-xs text-gray-500">{description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiKeysPanel;
