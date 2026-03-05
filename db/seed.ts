import { db, Ticker } from "astro:db";

export default async function seed() {
	await db.insert(Ticker).values([
		{ symbol: "DIA", label: "Dow Jones (ETF)", type: "equity" },
		{ symbol: "SPY", label: "S&P 500 (ETF)", type: "equity" },
		{ symbol: "QQQ", label: "NASDAQ (ETF)", type: "equity" },
		{ symbol: "BINANCE:BTCUSDT", label: "Bitcoin", type: "crypto" },
		{ symbol: "BINANCE:ETHUSDT", label: "Ethereum", type: "crypto" },
		{ symbol: "USO", label: "Oil (WTI ETF)", type: "commodity" },
	]);
}
