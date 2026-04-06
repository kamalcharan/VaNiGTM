/**
 * Yahoo Finance Data Service
 *
 * Downloads OHLCV data for NSE market indices from Yahoo Finance v8 chart API.
 * Ported from kewalinvest/backend/src/services/yahooFinance.service.ts.
 * No external dependencies — plain fetch with retry + exponential backoff.
 */

export interface YahooRecord {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

export interface YahooResponse {
  success: boolean;
  symbol: string;
  data: YahooRecord[];
  record_count: number;
  error?: string;
}

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseYahooResponse(json: any, symbol: string): YahooRecord[] {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data in Yahoo Finance response for ${symbol}`);

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

  const records: YahooRecord[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open  = quote.open?.[i];
    const high  = quote.high?.[i];
    const low   = quote.low?.[i];
    const close = quote.close?.[i];

    // Skip incomplete rows
    if (close == null || isNaN(close) || close <= 0) continue;

    records.push({
      date:      new Date(timestamps[i] * 1000),
      open:      open  != null ? Number(open.toFixed(4))  : close,
      high:      high  != null ? Number(high.toFixed(4))  : close,
      low:       low   != null ? Number(low.toFixed(4))   : close,
      close:     Number(close.toFixed(4)),
      adj_close: adjclose[i] != null ? Number(Number(adjclose[i]).toFixed(4)) : Number(close.toFixed(4)),
      volume:    quote.volume?.[i] != null ? Math.round(quote.volume[i]) : 0,
    });
  }

  return records;
}

async function fetchFromYahoo(
  symbol: string,
  startDate: Date,
  endDate: Date,
  timeoutMs = 30_000,
): Promise<YahooRecord[]> {
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const json = await res.json();
    return parseYahooResponse(json, symbol);
  } catch (err: any) {
    clearTimeout(tid);
    if (err.name === 'AbortError') throw new Error(`Yahoo Finance timeout after ${timeoutMs}ms`);
    throw err;
  }
}

/**
 * Download historical OHLCV data for a Yahoo Finance symbol.
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 */
export async function downloadYahooHistorical(
  symbol: string,
  startDate: Date,
  endDate: Date,
): Promise<YahooResponse> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fetchFromYahoo(symbol, startDate, endDate);
      return { success: true, symbol, data, record_count: data.length };
    } catch (err: any) {
      lastError = err;
      console.error(`[Yahoo] attempt ${attempt}/${maxAttempts} failed for ${symbol}: ${err.message}`);
      if (attempt < maxAttempts) await sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }

  return {
    success: false,
    symbol,
    data: [],
    record_count: 0,
    error: lastError?.message ?? 'Unknown error',
  };
}

/**
 * Download latest data (last 7 days) — used for EOD update.
 */
export async function downloadYahooLatest(symbol: string): Promise<YahooResponse> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return downloadYahooHistorical(symbol, start, end);
}
