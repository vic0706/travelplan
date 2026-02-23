// src/utils/api.ts
export const getApiUrl = (path: string): string => {
  // 優先使用環境變數，如果沒有則使用硬編碼的正式網址 (Fallback)
  const baseUrl = import.meta.env.VITE_WORKER_URL || "https://travelplan.vic070680.workers.dev";
  
  if (!baseUrl) {
    console.error("嚴重錯誤：找不到 VITE_WORKER_URL 且無預設值！");
    throw new Error("Missing VITE_WORKER_URL");
  }

  // 確保路徑拼接正確
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  return `${cleanBase}${cleanPath}`;
};
