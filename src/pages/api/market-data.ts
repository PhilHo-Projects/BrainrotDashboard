import type { APIRoute } from 'astro';
import { db, MarketCache, eq } from 'astro:db';
import yahooFinance from 'yahoo-finance2';

const SUPPORTED_RANGES = ['1D', '5D', '1M', '6M', 'YTD', '1Y'] as const;
type MarketRange = (typeof SUPPORTED_RANGES)[number];

function resolveRange(range: string | null): MarketRange {
    if (!range || !SUPPORTED_RANGES.includes(range as MarketRange)) {
        return '1D';
    }

    return range as MarketRange;
}

function getRangeConfig(range: MarketRange, now: Date) {
    switch (range) {
        case '5D':
            return {
                period1: new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)),
                interval: '30m'
            };
        case '1M':
            return {
                period1: new Date(now.getTime() - (31 * 24 * 60 * 60 * 1000)),
                interval: '1d'
            };
        case '6M':
            return {
                period1: new Date(now.getTime() - (183 * 24 * 60 * 60 * 1000)),
                interval: '1d'
            };
        case 'YTD':
            return {
                period1: new Date(now.getFullYear(), 0, 1),
                interval: '1d'
            };
        case '1Y':
            return {
                period1: new Date(now.getTime() - (366 * 24 * 60 * 60 * 1000)),
                interval: '1d'
            };
        case '1D':
        default:
            return {
                period1: new Date(now.getTime() - (24 * 60 * 60 * 1000)),
                interval: '1m'
            };
    }
}

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol');
    const range = resolveRange(url.searchParams.get('range'));

    if (!symbol) {
        return new Response(JSON.stringify({ error: "No symbol provided" }), { status: 400 });
    }

    try {
        const cacheKey = `${symbol}::${range}`;

        // 1. Check local Astro DB cache
        const existing = await db.select().from(MarketCache).where(eq(MarketCache.symbol, cacheKey));
        const now = Date.now();
        const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache to avoid rate limits

        if (existing.length > 0) {
            const cached = existing[0];
            const isStale = now - cached.lastUpdated > CACHE_TTL_MS;

            // If valid, return cached data instantly
            if (!isStale) {
                return new Response(cached.data, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 2. Fetch fresh data from Yahoo Finance explicitly bypassing premium keys
        // In this environment, the default export is a constructor/factory
        let yf: any = yahooFinance;
        if (typeof yahooFinance === 'function') {
            try { yf = new (yahooFinance as any)(); } catch (e) { yf = (yahooFinance as any)(); }
        }

        const rangeConfig = getRangeConfig(range, new Date(now));
        const chart = await yf.chart(symbol, {
            period1: rangeConfig.period1,
            interval: rangeConfig.interval
        });

        if (!chart || !chart.quotes || chart.quotes.length === 0) {
            return new Response(JSON.stringify({ error: "No data found for symbol" }), { status: 404 });
        }

        const quotes = chart.quotes.filter((quote: any) => typeof quote.close === 'number');
        if (quotes.length === 0) {
            return new Response(JSON.stringify({ error: "No close data found for symbol" }), { status: 404 });
        }

        const historicalData = quotes.map((q: any) => q.close);
        const firstClose = historicalData[0];
        const previousClose = chart.meta.previousClose;
        let rangeBase = range === '1D' ? previousClose : firstClose;
        if (!rangeBase || rangeBase === 0) {
            rangeBase = firstClose;
        }

        // Yahoo meta includes regularMarketPrice, fallback to the very last datapoint
        const currentPrice = chart.meta.regularMarketPrice || historicalData[historicalData.length - 1];

        let changeAmount = 0;
        let changePercent = 0;
        if (rangeBase && currentPrice) {
            changeAmount = currentPrice - rangeBase;
            changePercent = (changeAmount / rangeBase) * 100;
        }

        const rangeLow = Math.min(...historicalData);
        const rangeHigh = Math.max(...historicalData);

        const payload = {
            symbol: symbol,
            range,
            price: currentPrice,
            changeAmount: changeAmount,
            changePercent: changePercent,
            rangeBase,
            historicalData: historicalData,
            meta: {
                prevClose: previousClose || rangeBase,
                open: chart.meta.regularMarketOpen || rangeBase,
                volume: chart.meta.regularMarketVolume || 0,
                low: range === '1D' ? (chart.meta.regularMarketDayLow || rangeLow) : rangeLow,
                high: range === '1D' ? (chart.meta.regularMarketDayHigh || rangeHigh) : rangeHigh,
                yearLow: chart.meta.fiftyTwoWeekLow || 0,
                yearHigh: chart.meta.fiftyTwoWeekHigh || 0
            }
        };

        const payloadString = JSON.stringify(payload);

        // 3. Save the fresh data back into Astro DB
        if (existing.length > 0) {
            await db.update(MarketCache)
                .set({ data: payloadString, lastUpdated: now })
                .where(eq(MarketCache.symbol, cacheKey));
        } else {
            await db.insert(MarketCache).values({
                symbol: cacheKey,
                data: payloadString,
                lastUpdated: now
            });
        }

        // 4. Send to browser
        return new Response(payloadString, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error(`[Market Data API] Error fetching ${symbol} (${range}):`, error);
        return new Response(JSON.stringify({ error: "Failed to fetch market data", message: error.message, stack: error.stack }), { status: 500 });
    }
}
