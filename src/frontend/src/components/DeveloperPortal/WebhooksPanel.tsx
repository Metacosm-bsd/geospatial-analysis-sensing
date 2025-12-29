/**
 * Webhooks Panel Component
 * Sprint 49-54: Public API
 *
 * Manages webhook creation, listing, and testing.
 */

import { useState } from 'react';
import type { Webhook, WebhookDelivery, CreateWebhookInput } from './types';
import { WEBHOOK_EVENTS } from './types';

interface WebhooksPanelProps {
  webhooks: Webhook[];
  onCreateWebhook: (input: CreateWebhookInput) => Promise<Webhook>;
  onUpdateWebhook: (webhookId: string, data: Partial<Webhook>) => Promise<Webhook>;
  onDeleteWebhook: (webhookId: string) => Promise<void>;
  onTestWebhook: (webhookId: string) => Promise<{ success: boolean; statusCode?: number }>;
  onGetDeliveries: (webhookId: string) => Promise<WebhookDelivery[]>;
  onRetryDelivery: (webhookId: string, deliveryId: string) => Promise<void>;
}

export function WebhooksPanel({
  webhooks,
  onCreateWebhook,
  onUpdateWebhook,
  onDeleteWebhook,
  onTestWebhook,
  onGetDeliveries,
  onRetryDelivery,
}: WebhooksPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState<Webhook | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);

  const [createForm, setCreateForm] = useState<CreateWebhookInput>({
    url: '',
    events: [],
    description: '',
  });

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const webhook = await onCreateWebhook(createForm);
      setNewWebhook(webhook);
      setShowCreateModal(false);
      setCreateForm({ url: '', events: [], description: '' });
    } catch (error) {
      console.error('Failed to create webhook:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDeliveries = async (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    setLoadingDeliveries(true);
    try {
      const data = await onGetDeliveries(webhookId);
      setDeliveries(data);
    } catch (error) {
      console.error('Failed to load deliveries:', error);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleTest = async (webhookId: string) => {
    setTestingId(webhookId);
    setTestResult(null);
    try {
      const result = await onTestWebhook(webhookId);
      setTestResult({ id: webhookId, success: result.success });
      setTimeout(() => setTestResult(null), 3000);
    } catch (error) {
      setTestResult({ id: webhookId, success: false });
    } finally {
      setTestingId(null);
    }
  };

  const handleCopySecret = () => {
    if (newWebhook?.secret) {
      navigator.clipboard.writeText(newWebhook.secret);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'bg-green-100 text-green-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Webhooks</h2>
          <p className="text-sm text-gray-500 mt-1">
            Receive real-time notifications for events
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Webhook
        </button>
      </div>

      {/* New Webhook Secret Display */}
      {newWebhook?.secret && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="font-medium text-green-800">Webhook Created</h4>
              <p className="text-sm text-green-700 mt-1">
                Copy your signing secret now. You won't be able to see it again!
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded font-mono text-sm break-all">
                  {newWebhook.secret}
                </code>
                <button
                  onClick={handleCopySecret}
                  className="px-3 py-2 text-green-700 hover:bg-green-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setNewWebhook(null)}
                className="mt-3 text-sm text-green-700 hover:underline"
              >
                I've saved my secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      <div className="space-y-4">
        {webhooks.map((webhook) => (
          <div key={webhook.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <code className="text-sm font-medium text-gray-900 truncate">{webhook.url}</code>
                  </div>
                  {webhook.description && (
                    <p className="text-sm text-gray-500 mt-1">{webhook.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {webhook.events.map((event) => (
                      <span key={event} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {testResult?.id === webhook.id && (
                    <span className={`px-2 py-1 text-xs rounded ${testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {testResult.success ? 'Success!' : 'Failed'}
                    </span>
                  )}
                  <button
                    onClick={() => handleTest(webhook.id)}
                    disabled={testingId === webhook.id}
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                  >
                    {testingId === webhook.id ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleViewDeliveries(webhook.id)}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Deliveries
                  </button>
                  <button
                    onClick={() => onUpdateWebhook(webhook.id, { isActive: !webhook.isActive })}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    {webhook.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => onDeleteWebhook(webhook.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Deliveries Panel */}
            {selectedWebhookId === webhook.id && (
              <div className="border-t border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Deliveries</h4>
                {loadingDeliveries ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  </div>
                ) : deliveries.length > 0 ? (
                  <div className="space-y-2">
                    {deliveries.slice(0, 5).map((delivery) => (
                      <div key={delivery.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(delivery.status)}`}>
                            {delivery.status}
                          </span>
                          <span className="text-sm text-gray-600">{delivery.event}</span>
                          {delivery.statusCode && (
                            <span className="text-xs text-gray-400">HTTP {delivery.statusCode}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {new Date(delivery.createdAt).toLocaleString()}
                          </span>
                          {delivery.status === 'FAILED' && (
                            <button
                              onClick={() => onRetryDelivery(webhook.id, delivery.id)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No deliveries yet</p>
                )}
                <button
                  onClick={() => setSelectedWebhookId(null)}
                  className="mt-3 text-sm text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ))}

        {webhooks.length === 0 && (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-gray-500">No webhooks configured</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Add your first webhook
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Add Webhook</h3>
            </div>
            <div className="p-4 space-y-4">
              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  value={createForm.url}
                  onChange={(e) => setCreateForm({ ...createForm, url: e.target.value })}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={createForm.description || ''}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Production webhook for analysis events"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Events */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Events to Subscribe
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {Object.entries(WEBHOOK_EVENTS).map(([event, description]) => (
                    <label key={event} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={createForm.events.includes(event)}
                        onChange={(e) => {
                          const newEvents = e.target.checked
                            ? [...createForm.events, event]
                            : createForm.events.filter((ev) => ev !== event);
                          setCreateForm({ ...createForm, events: newEvents });
                        }}
                        className="rounded text-blue-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{event}</div>
                        <div className="text-xs text-gray-500">{description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({ url: '', events: [], description: '' });
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.url || createForm.events.length === 0 || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WebhooksPanel;
