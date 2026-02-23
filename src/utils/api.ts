// src/utils/api.ts
export const getApiUrl = (path: string): string => {
  // 強制使用絕對網址，確保請求不會因為相對路徑或環境變數出錯
  const baseUrl = "https://travelplan.vic070680.workers.dev";
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${cleanPath}`;
};
