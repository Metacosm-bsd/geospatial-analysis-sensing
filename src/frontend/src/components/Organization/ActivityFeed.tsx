/**
 * ActivityFeed Component
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Displays organization activity history.
 */

import type { ActivityLogEntry } from './types';

interface ActivityFeedProps {
  activities: ActivityLogEntry[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

export function ActivityFeed({
  activities,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: ActivityFeedProps) {
  const getActionIcon = (action: string) => {
    if (action.includes('MEMBER')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      );
    }
    if (action.includes('PROJECT')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    }
    if (action.includes('ANALYSIS')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    }
    if (action.includes('FILE')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      );
    }
    if (action.includes('REPORT')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    if (action.includes('COMMENT') || action.includes('ANNOTATION')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATED') || action.includes('JOINED') || action.includes('COMPLETED')) {
      return 'bg-green-100 text-green-600';
    }
    if (action.includes('DELETED') || action.includes('REMOVED') || action.includes('FAILED')) {
      return 'bg-red-100 text-red-600';
    }
    if (action.includes('UPDATED') || action.includes('CHANGED')) {
      return 'bg-blue-100 text-blue-600';
    }
    return 'bg-gray-100 text-gray-600';
  };

  const getActionDescription = (entry: ActivityLogEntry) => {
    const { action, targetName } = entry;
    const target = targetName || 'item';

    const descriptions: Record<string, string> = {
      MEMBER_JOINED: 'joined the organization',
      MEMBER_INVITED: `invited ${target}`,
      MEMBER_REMOVED: `removed ${target}`,
      MEMBER_ROLE_CHANGED: `changed role for ${target}`,
      PROJECT_CREATED: `created project "${target}"`,
      PROJECT_UPDATED: `updated project "${target}"`,
      PROJECT_DELETED: `deleted project "${target}"`,
      PROJECT_SHARED: `shared project "${target}"`,
      ANALYSIS_CREATED: `started analysis "${target}"`,
      ANALYSIS_COMPLETED: `completed analysis "${target}"`,
      ANALYSIS_FAILED: `analysis "${target}" failed`,
      ANALYSIS_DELETED: `deleted analysis "${target}"`,
      FILE_UPLOADED: `uploaded file "${target}"`,
      FILE_DELETED: `deleted file "${target}"`,
      REPORT_GENERATED: `generated report "${target}"`,
      REPORT_DOWNLOADED: `downloaded report "${target}"`,
      COMMENT_ADDED: 'added a comment',
      COMMENT_EDITED: 'edited a comment',
      COMMENT_DELETED: 'deleted a comment',
      ANNOTATION_CREATED: 'added an annotation',
      ANNOTATION_UPDATED: 'updated an annotation',
      ANNOTATION_DELETED: 'deleted an annotation',
      ORG_SETTINGS_UPDATED: 'updated organization settings',
      ORG_PLAN_CHANGED: 'changed organization plan',
    };

    return descriptions[action] || action.toLowerCase().replace(/_/g, ' ');
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Activity</h3>
        <p className="text-sm text-gray-500">Recent activity in your organization</p>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {activities.map((entry) => (
          <div key={entry.id} className="p-4 flex gap-3">
            {/* Icon */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getActionColor(entry.action)}`}>
              {getActionIcon(entry.action)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">
                {entry.actor ? (
                  <span className="font-medium">{entry.actor.name}</span>
                ) : (
                  <span className="text-gray-500">System</span>
                )}{' '}
                {getActionDescription(entry)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatTimeAgo(entry.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {activities.length === 0 && !isLoading && (
          <div className="p-8 text-center text-gray-500">
            <p>No activity yet</p>
          </div>
        )}

        {isLoading && (
          <div className="p-4 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && !isLoading && (
        <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
          <button
            onClick={onLoadMore}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Load more activity
          </button>
        </div>
      )}
    </div>
  );
}

export default ActivityFeed;
