export function getApiUrl(path: string): string {
  const baseUrl = 'https://travelplan.vic070680.workers.dev';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
