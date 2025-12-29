/**
 * Organization & Collaboration Types
 * Sprint 43-48: Collaboration & Multi-User
 */

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'EDITOR' | 'VIEWER';
export type OrgPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
export type ProjectAccessLevel = 'PRIVATE' | 'ORG_READ' | 'ORG_EDIT' | 'PUBLIC';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  plan: OrgPlan;
  planExpiresAt?: string;
  settings?: Record<string, unknown>;
  ssoEnabled: boolean;
  myRole?: OrgRole;
  memberCount?: number;
  projectCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  role: OrgRole;
  status: MemberStatus;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
  };
}

export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  status: InviteStatus;
  organizationName: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrgProject {
  id: string;
  projectId: string;
  accessLevel: ProjectAccessLevel;
  createdAt: string;
  project?: {
    id: string;
    name: string;
    description?: string;
    status: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
    _count?: {
      files: number;
      analyses: number;
    };
  };
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  targetType?: string;
  targetId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  content: string;
  targetType: 'PROJECT' | 'ANALYSIS' | 'REPORT' | 'FILE';
  targetId: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  replies?: Comment[];
  mentionCount?: number;
}

export interface Annotation {
  id: string;
  title: string;
  description?: string;
  position: { x: number; y: number; z: number };
  cameraState?: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
  };
  color?: string;
  icon?: string;
  isPublic: boolean;
  isOwn: boolean;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

// Role permissions helper
export const ROLE_PERMISSIONS: Record<OrgRole, {
  canManageMembers: boolean;
  canManageSettings: boolean;
  canDeleteOrg: boolean;
  canEditProjects: boolean;
  canViewProjects: boolean;
  canInvite: boolean;
}> = {
  OWNER: {
    canManageMembers: true,
    canManageSettings: true,
    canDeleteOrg: true,
    canEditProjects: true,
    canViewProjects: true,
    canInvite: true,
  },
  ADMIN: {
    canManageMembers: true,
    canManageSettings: true,
    canDeleteOrg: false,
    canEditProjects: true,
    canViewProjects: true,
    canInvite: true,
  },
  MEMBER: {
    canManageMembers: false,
    canManageSettings: false,
    canDeleteOrg: false,
    canEditProjects: true,
    canViewProjects: true,
    canInvite: false,
  },
  EDITOR: {
    canManageMembers: false,
    canManageSettings: false,
    canDeleteOrg: false,
    canEditProjects: true,
    canViewProjects: true,
    canInvite: false,
  },
  VIEWER: {
    canManageMembers: false,
    canManageSettings: false,
    canDeleteOrg: false,
    canEditProjects: false,
    canViewProjects: true,
    canInvite: false,
  },
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Administrator',
  MEMBER: 'Member',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

export const PLAN_LABELS: Record<OrgPlan, string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

export const ACCESS_LEVEL_LABELS: Record<ProjectAccessLevel, string> = {
  PRIVATE: 'Private',
  ORG_READ: 'Organization View',
  ORG_EDIT: 'Organization Edit',
  PUBLIC: 'Public Link',
};
