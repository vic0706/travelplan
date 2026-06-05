const CACHE_KEY = 'fx_cache_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface RateCache {
  rates: Record<string, number>;
  timestamp: number;
}

// Fetch USD-based rates from Frankfurter (free, no API key needed)
// rates[currency] = how many of that currency = 1 USD
export async function getUSDRates(): Promise<Record<string, number>> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: RateCache = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_TTL) {
        return { USD: 1, ...data.rates };
      }
    }
  } catch {}

  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (res.ok) {
      const data = await res.json();
      const rates = data.rates as Record<string, number>;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now() })); } catch {}
      return { USD: 1, ...rates };
    }
  } catch {}

  return { USD: 1 }; // fallback: no conversion available
}

// Convert amount from one currency to another using USD-based rates
// rates: { USD: 1, JPY: 150, TWD: 32.5, ... }
export function convertCurrency(amount: number, from: string, to: string, usdRates: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = usdRates[from];
  const toRate = usdRates[to];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}
