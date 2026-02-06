import crypto from "crypto";

const GROWW_API_BASE = "https://api.groww.in/v1";

interface GrowwQuote {
  last_price: number;
  day_change: number;
  day_change_perc: number;
  ohlc: string;
  high_trade_range: number;
  low_trade_range: number;
  average_price: number;
  bid_price: number;
  bid_quantity: number;
  offer_price: number;
  offer_quantity: number;
  total_buy_quantity: number;
  total_sell_quantity: number;
  last_trade_quantity: number;
  last_trade_time: number;
  open_interest?: number;
}

interface GrowwQuoteResponse {
  status: string;
  payload: GrowwQuote;
}

interface GrowwOHLCResponse {
  status: string;
  payload: Record<string, string>;
}

interface GrowwLTPResponse {
  status: string;
  payload: Record<string, number>;
}

export interface LivePrice {
  symbol: string;
  exchange: string;
  ltp: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
}

const priceCache: Map<string, { data: LivePrice; expiry: number }> = new Map();
const CACHE_TTL = 5000;

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;
let tokenSetAt: number = 0;
let tokenSource: "manual" | "api_key_secret" | "none" = "none";

function generateChecksum(secret: string, timestamp: string): string {
  const input = secret + timestamp;
  return crypto.createHash("sha256").update(input).digest("hex");
}

function computeExpiryMs(): number {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const tomorrow6AM = new Date(istNow);
  tomorrow6AM.setHours(6, 0, 0, 0);
  if (istNow.getHours() >= 6) {
    tomorrow6AM.setDate(tomorrow6AM.getDate() + 1);
  }
  return tomorrow6AM.getTime() - istNow.getTime();
}

export function setGrowwAccessToken(token: string): { success: boolean; expiresIn: string } {
  cachedAccessToken = token;
  const msUntilExpiry = computeExpiryMs();
  tokenExpiry = Date.now() + msUntilExpiry - 60000;
  tokenSetAt = Date.now();
  tokenSource = "manual";
  priceCache.clear();
  console.log(`[Groww] Access token set manually, expires in ${Math.round(msUntilExpiry / 3600000)}h`);
  return { success: true, expiresIn: `${Math.round(msUntilExpiry / 3600000)} hours` };
}

export function getGrowwTokenStatus(): {
  hasToken: boolean;
  source: string;
  setAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
} {
  const hasToken = !!cachedAccessToken && Date.now() < tokenExpiry;
  return {
    hasToken,
    source: tokenSource,
    setAt: tokenSetAt > 0 ? new Date(tokenSetAt).toISOString() : null,
    expiresAt: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : null,
    isExpired: tokenExpiry > 0 && Date.now() >= tokenExpiry,
  };
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  const apiKey = process.env.GROWW_API_KEY;
  const apiSecret = process.env.GROWW_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("GROWW_API_KEY or GROWW_API_SECRET not configured. Please set a Groww access token from the admin portal.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const checksum = generateChecksum(apiSecret, timestamp);

  console.log(`[Groww] Requesting access token via API Key+Secret...`);

  const response = await fetch(`${GROWW_API_BASE}/token/api/access`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key_type: "approval",
      checksum,
      timestamp,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Groww] Token exchange failed: ${response.status} - ${errorText}`);
    throw new Error(`Groww token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.token) {
    console.error("[Groww] No token in response:", data);
    throw new Error("Groww token exchange returned no token");
  }

  cachedAccessToken = data.token;
  const msUntilExpiry = computeExpiryMs();
  tokenExpiry = Date.now() + msUntilExpiry - 60000;
  tokenSetAt = Date.now();
  tokenSource = "api_key_secret";

  console.log(`[Groww] Access token obtained via API Key+Secret, expires in ${Math.round(msUntilExpiry / 3600000)}h`);
  return cachedAccessToken;
}

function getHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-API-VERSION": "1.0",
  };
}

function resolveExchangeAndSegment(
  symbol: string,
  strategyType?: string
): { exchange: string; segment: string; tradingSymbol: string } {
  const upperSymbol = symbol.toUpperCase().trim();

  const commoditySymbols = [
    "CRUDEOIL", "GOLD", "GOLDM", "SILVER", "SILVERM",
    "NATURALGAS", "COPPER", "ZINC", "ALUMINIUM", "LEAD", "NICKEL", "COTTONCANDY",
  ];
  if (commoditySymbols.includes(upperSymbol) || strategyType === "Commodity" || strategyType === "CommodityFuture") {
    return { exchange: "MCX", segment: "COMMODITY", tradingSymbol: upperSymbol };
  }

  const indexSymbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
  if (indexSymbols.includes(upperSymbol)) {
    const bseIndices = ["SENSEX", "BANKEX"];
    return {
      exchange: bseIndices.includes(upperSymbol) ? "BSE" : "NSE",
      segment: "CASH",
      tradingSymbol: upperSymbol,
    };
  }

  if (strategyType === "Future" || strategyType === "Option") {
    return { exchange: "NSE", segment: "FNO", tradingSymbol: upperSymbol };
  }

  return { exchange: "NSE", segment: "CASH", tradingSymbol: upperSymbol };
}

function parseOHLC(ohlcStr: string): { open: number; high: number; low: number; close: number } {
  try {
    const cleaned = ohlcStr
      .replace(/\{/g, '{"')
      .replace(/:/g, '":')
      .replace(/,\s*/g, ',"')
      .replace(/""/g, '"');
    const parsed = JSON.parse(cleaned);
    return {
      open: Number(parsed.open) || 0,
      high: Number(parsed.high) || 0,
      low: Number(parsed.low) || 0,
      close: Number(parsed.close) || 0,
    };
  } catch {
    return { open: 0, high: 0, low: 0, close: 0 };
  }
}

export async function getLiveQuote(
  symbol: string,
  strategyType?: string
): Promise<LivePrice | null> {
  const cacheKey = `${symbol}_${strategyType || ""}`;
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const accessToken = await getAccessToken();
    const { exchange, segment, tradingSymbol } = resolveExchangeAndSegment(symbol, strategyType);
    const url = `${GROWW_API_BASE}/live-data/quote?exchange=${exchange}&segment=${segment}&trading_symbol=${tradingSymbol}`;

    const response = await fetch(url, { headers: getHeaders(accessToken) });
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Groww] Quote error for ${symbol}: ${response.status} - ${errBody}`);
      if (response.status === 403) {
        cachedAccessToken = null;
        tokenExpiry = 0;
      }
      return null;
    }

    const data: GrowwQuoteResponse = await response.json();
    if (data.status !== "SUCCESS" || !data.payload) return null;

    const ohlc = data.payload.ohlc ? parseOHLC(data.payload.ohlc) : { open: 0, high: 0, low: 0, close: 0 };

    const livePrice: LivePrice = {
      symbol: tradingSymbol,
      exchange,
      ltp: data.payload.last_price,
      change: data.payload.day_change,
      changePercent: data.payload.day_change_perc,
      high: data.payload.high_trade_range || ohlc.high,
      low: data.payload.low_trade_range || ohlc.low,
      open: ohlc.open,
      close: ohlc.close,
      timestamp: data.payload.last_trade_time || Date.now(),
    };

    priceCache.set(cacheKey, { data: livePrice, expiry: Date.now() + CACHE_TTL });
    return livePrice;
  } catch (err) {
    console.error(`[Groww] Error fetching quote for ${symbol}:`, err);
    return null;
  }
}

export async function getBulkLTP(
  symbols: Array<{ symbol: string; strategyType?: string }>
): Promise<Record<string, LivePrice>> {
  const results: Record<string, LivePrice> = {};
  const uncached: Array<{ symbol: string; strategyType?: string }> = [];

  for (const item of symbols) {
    const cacheKey = `${item.symbol}_${item.strategyType || ""}`;
    const cached = priceCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      results[item.symbol] = cached.data;
    } else {
      uncached.push(item);
    }
  }

  if (uncached.length === 0) return results;

  try {
    const accessToken = await getAccessToken();

    const grouped: Record<string, Array<{ symbol: string; exchange: string; segment: string; tradingSymbol: string; strategyType?: string }>> = {};

    for (const item of uncached) {
      const resolved = resolveExchangeAndSegment(item.symbol, item.strategyType);
      const key = resolved.segment;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ ...resolved, symbol: item.symbol, strategyType: item.strategyType });
    }

    for (const [segment, items] of Object.entries(grouped)) {
      const batches: typeof items[] = [];
      for (let i = 0; i < items.length; i += 50) {
        batches.push(items.slice(i, i + 50));
      }

      for (const batch of batches) {
        const exchangeSymbols = batch.map((b) => `${b.exchange}_${b.tradingSymbol}`).join(",");
        const ltpUrl = `${GROWW_API_BASE}/live-data/ltp?segment=${segment}&exchange_symbols=${exchangeSymbols}`;
        const ohlcUrl = `${GROWW_API_BASE}/live-data/ohlc?segment=${segment}&exchange_symbols=${exchangeSymbols}`;

        const [ltpResponse, ohlcResponse] = await Promise.all([
          fetch(ltpUrl, { headers: getHeaders(accessToken) }),
          fetch(ohlcUrl, { headers: getHeaders(accessToken) }),
        ]);

        if (!ltpResponse.ok) {
          console.error(`[Groww] Bulk LTP error: ${ltpResponse.status}`);
          if (ltpResponse.status === 403) {
            cachedAccessToken = null;
            tokenExpiry = 0;
          }
          continue;
        }

        const ltpData: GrowwLTPResponse = await ltpResponse.json();
        if (ltpData.status !== "SUCCESS" || !ltpData.payload) continue;

        let ohlcData: Record<string, { open: number; high: number; low: number; close: number }> = {};
        if (ohlcResponse.ok) {
          const ohlcRaw: GrowwOHLCResponse = await ohlcResponse.json();
          if (ohlcRaw.status === "SUCCESS" && ohlcRaw.payload) {
            for (const [key, ohlcStr] of Object.entries(ohlcRaw.payload)) {
              ohlcData[key] = parseOHLC(ohlcStr);
            }
          }
        }

        for (const item of batch) {
          const lookupKey = `${item.exchange}_${item.tradingSymbol}`;
          const ltp = ltpData.payload[lookupKey];
          if (ltp !== undefined && ltp !== null) {
            const ohlc = ohlcData[lookupKey] || { open: 0, high: 0, low: 0, close: 0 };
            const change = ohlc.close > 0 ? ltp - ohlc.close : 0;
            const changePercent = ohlc.close > 0 ? ((ltp - ohlc.close) / ohlc.close) * 100 : 0;

            const livePrice: LivePrice = {
              symbol: item.tradingSymbol,
              exchange: item.exchange,
              ltp,
              change,
              changePercent,
              high: ohlc.high,
              low: ohlc.low,
              open: ohlc.open,
              close: ohlc.close,
              timestamp: Date.now(),
            };
            results[item.symbol] = livePrice;
            const cacheKey = `${item.symbol}_${item.strategyType || ""}`;
            priceCache.set(cacheKey, { data: livePrice, expiry: Date.now() + CACHE_TTL });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Groww] Error in bulk LTP fetch:", err);
  }

  return results;
}

export async function getLivePrices(
  symbols: Array<{ symbol: string; strategyType?: string }>
): Promise<Record<string, LivePrice>> {
  const results: Record<string, LivePrice> = {};

  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map((item) => getLiveQuote(item.symbol, item.strategyType));
    const batchResults = await Promise.allSettled(promises);

    batchResults.forEach((result, idx) => {
      if (result.status === "fulfilled" && result.value) {
        results[batch[idx].symbol] = result.value;
      }
    });
  }

  return results;
}

export async function getBulkOHLC(
  symbols: string[],
  segment: string = "CASH"
): Promise<Record<string, { open: number; high: number; low: number; close: number }>> {
  try {
    const accessToken = await getAccessToken();
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += 50) {
      batches.push(symbols.slice(i, i + 50));
    }

    const results: Record<string, { open: number; high: number; low: number; close: number }> = {};

    for (const batch of batches) {
      const exchangeSymbols = batch.map((s) => `NSE_${s.toUpperCase()}`).join(",");
      const url = `${GROWW_API_BASE}/live-data/ohlc?segment=${segment}&exchange_symbols=${exchangeSymbols}`;

      const response = await fetch(url, { headers: getHeaders(accessToken) });
      if (!response.ok) continue;

      const data: GrowwOHLCResponse = await response.json();
      if (data.status !== "SUCCESS" || !data.payload) continue;

      for (const [key, ohlcStr] of Object.entries(data.payload)) {
        const sym = key.replace(/^(NSE|BSE|MCX)_/, "");
        results[sym] = parseOHLC(ohlcStr);
      }
    }

    return results;
  } catch (err) {
    console.error("[Groww] Error fetching bulk OHLC:", err);
    return {};
  }
}
