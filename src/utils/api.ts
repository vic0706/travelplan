import { useAppStore } from '../store';

export const getApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Use user's worker URL as requested
  return `https://travelplan.vic070680.workers.dev${cleanPath}`;
};

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const url = getApiUrl(path);
  const token = useAppStore.getState().token;

  const headers = new Headers(options.headers);
  
  // Add Authorization header if token exists and not calling public endpoints
  const publicEndpoints = ['/api/init', '/api/users/login-list', '/api/auth/login'];
  if (token && !publicEndpoints.some(ep => path === ep)) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Default to JSON content type if body is present and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Handle Unauthorized
      useAppStore.getState().logout();
      useAppStore.getState().setLoginModalOpen(true);
      throw new Error('Unauthorized');
    }

    return response;
  } catch (error) {
    console.error(`API Request Failed for ${getApiUrl(path)}:`, error);
    throw error;
  }
};
