export const getApiUrl = (path: string) => {
  // In a real app, you might switch this based on environment
  return path;
};

export const apiFetch = (path: string, options: RequestInit = {}) => {
  return fetch(getApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};
