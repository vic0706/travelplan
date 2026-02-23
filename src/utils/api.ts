export function getApiUrl(path: string): string {
  // Use relative path. 
  // In development, Vite proxy will forward this to VITE_WORKER_URL.
  // In production, it will request from the same domain.
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath;
}
