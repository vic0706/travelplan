// src/utils/api.ts
export const getApiUrl = (path: string): string => {
  const baseUrl = import.meta.env.VITE_WORKER_URL;
  
  if (!baseUrl) {
    console.error("嚴重錯誤：找不到 VITE_WORKER_URL 環境變數！");
    // 為了避免噴 HTML，如果沒網址，寧可讓它報錯
    throw new Error("Missing VITE_WORKER_URL in environment variables.");
  }

  // 確保路徑拼接正確
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  return `${cleanBase}${cleanPath}`;
};
