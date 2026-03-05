import type { APIRoute } from 'astro';
import { db, MarketCache, eq } from 'astro:db';
import yahooFinance from 'yahoo-finance2';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol');

    if (!symbol) {
        return new Response(JSON.stringify({ error: "No symbol provided" }), { status: 400 });
    }

    try {
        // 1. Check local Astro DB cache
        const existing = await db.select().from(MarketCache).where(eq(MarketCache.symbol, symbol));
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

        const yesterday = new Date(now - (24 * 60 * 60 * 1000));

        // For a precise 1D chart, we ask for 1-minute intervals over the last 1 day
        const chart = await yf.chart(symbol, { period1: yesterday, interval: '1m' });

        if (!chart || !chart.quotes || chart.quotes.length === 0) {
            return new Response(JSON.stringify({ error: "No data found for symbol" }), { status: 404 });
        }

        const quotes = chart.quotes;

        // Calculate the precise daily change using previous close as the base
        let basePrice = chart.meta.previousClose;
        if (!basePrice || basePrice === 0) {
            basePrice = quotes[0].close || quotes[1].close;
        }

        // Yahoo meta includes regularMarketPrice, fallback to the very last datapoint
        const currentPrice = chart.meta.regularMarketPrice || quotes[quotes.length - 1].close;

        let changeAmount = 0;
        let changePercent = 0;
        if (basePrice && currentPrice) {
            changeAmount = currentPrice - basePrice;
            changePercent = (changeAmount / basePrice) * 100;
        }

        // Extract just the raw prices for our Sparkline Chart.js
        const historicalData = quotes.map((q: any) => q.close).filter((c: any) => c !== null);

        const payload = {
            symbol: symbol,
            price: currentPrice,
            changeAmount: changeAmount,
            changePercent: changePercent,
            historicalData: historicalData,
            meta: {
                prevClose: basePrice,
                open: chart.meta.regularMarketDayLow && chart.meta.regularMarketDayHigh ? chart.meta.previousClose : basePrice, // approximate if not direct
                volume: chart.meta.regularMarketVolume || 0,
                low: chart.meta.regularMarketDayLow || Math.min(...historicalData),
                high: chart.meta.regularMarketDayHigh || Math.max(...historicalData),
                yearLow: chart.meta.fiftyTwoWeekLow || 0,
                yearHigh: chart.meta.fiftyTwoWeekHigh || 0
            }
        };

        const payloadString = JSON.stringify(payload);

        // 3. Save the fresh data back into Astro DB
        if (existing.length > 0) {
            await db.update(MarketCache)
                .set({ data: payloadString, lastUpdated: now })
                .where(eq(MarketCache.symbol, symbol));
        } else {
            await db.insert(MarketCache).values({
                symbol: symbol,
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
        console.error(`[Market Data API] Error fetching ${symbol}:`, error);
        return new Response(JSON.stringify({ error: "Failed to fetch market data", message: error.message, stack: error.stack }), { status: 500 });
    }
}
