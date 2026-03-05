import { defineDb, defineTable, column } from "astro:db";

const Ticker = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    symbol: column.text(),      // e.g. "DIA", "BINANCE:BTCUSDT"
    label: column.text(),      // e.g. "Dow Jones ETF"
    type: column.text(),      // "equity" | "crypto" | "commodity"
    enabled: column.boolean({ default: true }),
  },
});

const YoutubeFeed = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    videoId: column.text({ unique: true }), // Prevents n8n from inserting duplicates
    channelName: column.text(),
    title: column.text(),
    url: column.text(),
    thumbnail: column.text(),
    publishedAt: column.text(), // We'll store ISO strings like "2026-03-04T12:00:00Z" for simplicity
    isHidden: column.boolean({ default: false }),
    isSaved: column.boolean({ default: false }),
  }
});

const MarketCache = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    symbol: column.text({ unique: true }),
    data: column.text(), // JSON string containing price and historical array
    lastUpdated: column.number(), // Unix timestamp of last fetch
  }
});

export default defineDb({ tables: { Ticker, YoutubeFeed, MarketCache } });
