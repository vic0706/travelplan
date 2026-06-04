import { Env } from '../worker';

export async function searchUnsplash(query: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
    );
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.results?.length > 0 ? data.results[0].urls.regular : null;
  } catch (e) { return null; }
}
