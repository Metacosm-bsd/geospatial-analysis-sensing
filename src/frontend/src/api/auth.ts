import apiClient, { tokenStorage, getErrorMessage } from './client';
import type {
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AuthTokens,
} from '../types';

// Auth API endpoints
const AUTH_ENDPOINTS = {
  register: '/auth/register',
  login: '/auth/login',
  logout: '/auth/logout',
  refresh: '/auth/refresh',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  me: '/auth/me',
  verifyEmail: '/auth/verify-email',
};

/**
 * Register a new user
 */
export async function register(
  name: string,
  email: string,
  password: string
): Promise<RegisterResponse> {
  try {
    const response = await apiClient.post<RegisterResponse>(AUTH_ENDPOINTS.register, {
      name,
      email,
      password,
    } as RegisterRequest);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Login user and store tokens
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  try {
    const response = await apiClient.post<LoginResponse>(AUTH_ENDPOINTS.login, {
      email,
      password,
    } as LoginRequest);

    const { user, tokens } = response.data;

    // Store tokens in localStorage
    tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Logout user and clear tokens
 */
export async function logout(): Promise<void> {
  try {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      await apiClient.post(AUTH_ENDPOINTS.logout, { refreshToken });
    }
  } catch (error) {
    // Ignore logout errors, still clear tokens
    console.warn('Logout API error:', getErrorMessage(error));
  } finally {
    tokenStorage.clearTokens();
  }
}

/**
 * Refresh access token
 */
export async function refreshToken(): Promise<AuthTokens> {
  try {
    const currentRefreshToken = tokenStorage.getRefreshToken();
    if (!currentRefreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post<{ tokens: AuthTokens }>(AUTH_ENDPOINTS.refresh, {
      refreshToken: currentRefreshToken,
    });

    const { tokens } = response.data;

    // Store new tokens
    tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);

    return tokens;
  } catch (error) {
    tokenStorage.clearTokens();
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Request password reset email
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  try {
    const response = await apiClient.post<{ message: string }>(AUTH_ENDPOINTS.forgotPassword, {
      email,
    } as ForgotPasswordRequest);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  password: string
): Promise<{ message: string }> {
  try {
    const response = await apiClient.post<{ message: string }>(AUTH_ENDPOINTS.resetPassword, {
      token,
      password,
    } as ResetPasswordRequest);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<User> {
  try {
    const response = await apiClient.get<{ user: User }>(AUTH_ENDPOINTS.me);
    return response.data.user;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<{ message: string }> {
  try {
    const response = await apiClient.post<{ message: string }>(AUTH_ENDPOINTS.verifyEmail, {
      token,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Check if user is authenticated (has valid tokens)
 */
export function isAuthenticated(): boolean {
  return tokenStorage.hasTokens();
}
