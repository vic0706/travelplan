// src/utils/api.ts
export const getApiUrl = (path: string): string => {
  // 確保路徑以 / 開頭
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 如果在瀏覽器環境中，且我們就在正式域名下，直接回傳相對路徑
  // 這能解決所有 VITE_WORKER_URL 為 undefined 或跨域的問題
  if (typeof window !== 'undefined') {
    return cleanPath;
  }

  // Fallback (主要用於 SSR 或非瀏覽器環境)
  const baseUrl = import.meta.env.VITE_WORKER_URL || "https://travelplan.vic070680.workers.dev";
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  return `${cleanBase}${cleanPath}`;
};
