/**
 * OrganizationCard Component
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Displays organization details and quick actions.
 */

import type { Organization } from './types';
import { ROLE_LABELS, PLAN_LABELS, ROLE_PERMISSIONS } from './types';

interface OrganizationCardProps {
  organization: Organization;
  onSelect?: (org: Organization) => void;
  onSettings?: (org: Organization) => void;
  onLeave?: (org: Organization) => void;
}

export function OrganizationCard({
  organization,
  onSelect,
  onSettings,
  onLeave,
}: OrganizationCardProps) {
  const myRole = organization.myRole || 'VIEWER';
  const permissions = ROLE_PERMISSIONS[myRole];

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect?.(organization)}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          {/* Logo/Avatar */}
          <div className="flex-shrink-0">
            {organization.logoUrl ? (
              <img
                src={organization.logoUrl}
                alt={organization.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                {organization.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name and Description */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {organization.name}
            </h3>
            {organization.description && (
              <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                {organization.description}
              </p>
            )}
          </div>

          {/* Plan Badge */}
          <div className="flex-shrink-0">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                organization.plan === 'ENTERPRISE'
                  ? 'bg-purple-100 text-purple-700'
                  : organization.plan === 'PROFESSIONAL'
                  ? 'bg-blue-100 text-blue-700'
                  : organization.plan === 'STARTER'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {PLAN_LABELS[organization.plan]}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="p-3 text-center">
          <p className="text-xl font-semibold text-gray-900">
            {organization.memberCount || 0}
          </p>
          <p className="text-xs text-gray-500">Members</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-xl font-semibold text-gray-900">
            {organization.projectCount || 0}
          </p>
          <p className="text-xs text-gray-500">Projects</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm font-medium text-gray-900">
            {ROLE_LABELS[myRole]}
          </p>
          <p className="text-xs text-gray-500">Your Role</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
        {permissions.canManageSettings && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSettings?.(organization);
            }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Settings
          </button>
        )}
        {myRole !== 'OWNER' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLeave?.(organization);
            }}
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
          >
            Leave
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(organization);
          }}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Open
        </button>
      </div>
    </div>
  );
}

export default OrganizationCard;
