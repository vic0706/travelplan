export function getApiUrl(path: string): string {
  let baseUrl = import.meta.env.VITE_WORKER_URL || '';
  
  if (baseUrl === 'undefined') {
    baseUrl = '';
  }
  
  // Remove surrounding quotes if any
  baseUrl = baseUrl.replace(/^["']|["']$/g, '');
  
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
