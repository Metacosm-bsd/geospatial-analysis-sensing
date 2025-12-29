/**
 * TeamMembersCard Component
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Displays team members with role management.
 */

import { useState } from 'react';
import type { OrganizationMember, OrgRole } from './types';
import { ROLE_LABELS, ROLE_PERMISSIONS } from './types';

interface TeamMembersCardProps {
  members: OrganizationMember[];
  currentUserRole: OrgRole;
  onInvite?: () => void;
  onUpdateRole?: (memberId: string, newRole: OrgRole) => void;
  onRemove?: (memberId: string) => void;
}

export function TeamMembersCard({
  members,
  currentUserRole,
  onInvite,
  onUpdateRole,
  onRemove,
}: TeamMembersCardProps) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const permissions = ROLE_PERMISSIONS[currentUserRole];

  const roleOptions: OrgRole[] = ['ADMIN', 'MEMBER', 'EDITOR', 'VIEWER'];

  const getRoleBadgeColor = (role: OrgRole) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-700';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-700';
      case 'EDITOR':
        return 'bg-green-100 text-green-700';
      case 'MEMBER':
        return 'bg-gray-100 text-gray-700';
      case 'VIEWER':
        return 'bg-gray-100 text-gray-600';
    }
  };

  const canModifyMember = (member: OrganizationMember) => {
    if (!permissions.canManageMembers) return false;
    if (member.role === 'OWNER') return false;
    if (currentUserRole === 'ADMIN' && member.role === 'ADMIN') return false;
    return true;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
          <p className="text-sm text-gray-500">{members.length} members</p>
        </div>
        {permissions.canInvite && (
          <button
            onClick={onInvite}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Invite Member
          </button>
        )}
      </div>

      {/* Members List */}
      <div className="divide-y divide-gray-100">
        {members.map((member) => (
          <div key={member.id} className="p-4 flex items-center gap-4">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {member.user.avatarUrl ? (
                <img
                  src={member.user.avatarUrl}
                  alt={member.user.name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                  {member.user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Name and Email */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{member.user.name}</p>
              <p className="text-sm text-gray-500 truncate">{member.user.email}</p>
            </div>

            {/* Role */}
            <div className="flex items-center gap-2">
              {editingMemberId === member.id ? (
                <select
                  value={member.role}
                  onChange={(e) => {
                    onUpdateRole?.(member.id, e.target.value as OrgRole);
                    setEditingMemberId(null);
                  }}
                  onBlur={() => setEditingMemberId(null)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  autoFocus
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}
                >
                  {ROLE_LABELS[member.role]}
                </span>
              )}

              {/* Actions */}
              {canModifyMember(member) && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingMemberId(member.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Change role"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onRemove?.(member.id)}
                    className="p-1 text-red-400 hover:text-red-600 rounded"
                    title="Remove member"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <p>No members yet</p>
            {permissions.canInvite && (
              <button
                onClick={onInvite}
                className="mt-2 text-blue-600 hover:underline"
              >
                Invite your first team member
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer with member status legend */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${getRoleBadgeColor('OWNER').split(' ')[0]}`} />
            Owner
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${getRoleBadgeColor('ADMIN').split(' ')[0]}`} />
            Admin
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${getRoleBadgeColor('EDITOR').split(' ')[0]}`} />
            Editor
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${getRoleBadgeColor('VIEWER').split(' ')[0]}`} />
            Viewer
          </span>
        </div>
      </div>
    </div>
  );
}

export default TeamMembersCard;
