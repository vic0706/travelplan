export function getApiUrl(path: string): string {
  let baseUrl = import.meta.env.VITE_WORKER_URL || '';
  
  // If we are in local dev and no worker URL is set, use local
  if (!baseUrl || baseUrl === 'undefined' || baseUrl === '') {
    baseUrl = window.location.origin;
  }
  
  // Remove surrounding quotes if any
  baseUrl = baseUrl.replace(/^["']|["']$/g, '');
  
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
