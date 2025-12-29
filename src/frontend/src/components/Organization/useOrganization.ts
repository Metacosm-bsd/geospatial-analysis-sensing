/**
 * useOrganization Hook
 * Sprint 43-48: Collaboration & Multi-User
 *
 * React hook for organization management APIs.
 */

import { useState, useCallback } from 'react';
import type {
  Organization,
  OrganizationMember,
  Invitation,
  OrgProject,
  ActivityLogEntry,
  Notification,
  OrgRole,
  ProjectAccessLevel,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface UseOrganizationReturn {
  // State
  isLoading: boolean;
  error: string | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  members: OrganizationMember[];
  projects: OrgProject[];
  activities: ActivityLogEntry[];
  notifications: Notification[];
  unreadCount: number;

  // Organization actions
  fetchOrganizations: () => Promise<void>;
  fetchOrganization: (orgId: string) => Promise<Organization | null>;
  createOrganization: (data: CreateOrgInput) => Promise<Organization | null>;
  updateOrganization: (orgId: string, data: UpdateOrgInput) => Promise<void>;
  deleteOrganization: (orgId: string) => Promise<void>;

  // Member actions
  fetchMembers: (orgId: string) => Promise<void>;
  inviteMember: (orgId: string, email: string, role: OrgRole) => Promise<Invitation | null>;
  acceptInvitation: (token: string) => Promise<void>;
  updateMemberRole: (orgId: string, memberId: string, role: OrgRole) => Promise<void>;
  removeMember: (orgId: string, memberId: string) => Promise<void>;
  leaveOrganization: (orgId: string) => Promise<void>;

  // Project sharing
  fetchOrgProjects: (orgId: string) => Promise<void>;
  shareProject: (orgId: string, projectId: string, accessLevel: ProjectAccessLevel) => Promise<void>;
  unshareProject: (orgId: string, projectId: string) => Promise<void>;

  // Activity
  fetchActivities: (orgId: string) => Promise<void>;

  // Notifications
  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;

  // Helpers
  clearError: () => void;
  setCurrentOrg: (org: Organization | null) => void;
}

interface CreateOrgInput {
  name: string;
  slug: string;
  description?: string;
  website?: string;
}

interface UpdateOrgInput {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
}

export function useOrganization(): UseOrganizationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const clearError = useCallback(() => setError(null), []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // ============================================================================
  // Organization CRUD
  // ============================================================================

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const data = await response.json();
      setOrganizations(data.data.organizations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOrganization = useCallback(async (orgId: string): Promise<Organization | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }

      const data = await response.json();
      setCurrentOrg(data.data.organization);
      return data.data.organization;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createOrganization = useCallback(async (input: CreateOrgInput): Promise<Organization | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create organization');
      }

      const data = await response.json();
      setOrganizations((prev) => [...prev, data.data.organization]);
      return data.data.organization;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrganization = useCallback(async (orgId: string, input: UpdateOrgInput) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error('Failed to update organization');
      }

      const data = await response.json();
      setOrganizations((prev) =>
        prev.map((org) => (org.id === orgId ? data.data.organization : org))
      );
      if (currentOrg?.id === orgId) {
        setCurrentOrg(data.data.organization);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  const deleteOrganization = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to delete organization');
      }

      setOrganizations((prev) => prev.filter((org) => org.id !== orgId));
      if (currentOrg?.id === orgId) {
        setCurrentOrg(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  // ============================================================================
  // Member Management
  // ============================================================================

  const fetchMembers = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/members`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }

      const data = await response.json();
      setMembers(data.data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const inviteMember = useCallback(async (orgId: string, email: string, role: OrgRole): Promise<Invitation | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitation');
      }

      const data = await response.json();
      return data.data.invitation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptInvitation = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/invitations/${token}/accept`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to accept invitation');
      }

      // Refresh organizations list
      await fetchOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrganizations]);

  const updateMemberRole = useCallback(async (orgId: string, memberId: string, role: OrgRole) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/members/${memberId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error('Failed to update member role');
      }

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeMember = useCallback(async (orgId: string, memberId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/members/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const leaveOrganization = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/leave`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to leave organization');
      }

      setOrganizations((prev) => prev.filter((org) => org.id !== orgId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Project Sharing
  // ============================================================================

  const fetchOrgProjects = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/projects`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      setProjects(data.data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const shareProject = useCallback(async (orgId: string, projectId: string, accessLevel: ProjectAccessLevel) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ projectId, accessLevel }),
      });

      if (!response.ok) {
        throw new Error('Failed to share project');
      }

      await fetchOrgProjects(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrgProjects]);

  const unshareProject = useCallback(async (orgId: string, projectId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/projects/${projectId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to unshare project');
      }

      setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Activity Feed
  // ============================================================================

  const fetchActivities = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${orgId}/activity`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch activity');
      }

      const data = await response.json();
      setActivities(data.data.activities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Notifications
  // ============================================================================

  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    try {
      const url = new URL(`${API_BASE_URL}/api/v1/notifications`);
      if (unreadOnly) url.searchParams.set('unreadOnly', 'true');

      const response = await fetch(url.toString(), {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      setNotifications(data.data.notifications);
    } catch (err) {
      // Silently fail
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/unread-count`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.data.count);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }, []);

  return {
    isLoading,
    error,
    organizations,
    currentOrg,
    members,
    projects,
    activities,
    notifications,
    unreadCount,
    fetchOrganizations,
    fetchOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    fetchMembers,
    inviteMember,
    acceptInvitation,
    updateMemberRole,
    removeMember,
    leaveOrganization,
    fetchOrgProjects,
    shareProject,
    unshareProject,
    fetchActivities,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    clearError,
    setCurrentOrg,
  };
}

export default useOrganization;
