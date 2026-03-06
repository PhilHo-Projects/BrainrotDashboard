import { db, Ticker, YoutubeFeed } from "astro:db";
import fs from "fs";
import path from "path";

export default async function seed() {
	await db.insert(Ticker).values([
		{ symbol: "DIA", label: "Dow Jones (ETF)", type: "equity" },
		{ symbol: "SPY", label: "S&P 500 (ETF)", type: "equity" },
		{ symbol: "QQQ", label: "NASDAQ (ETF)", type: "equity" },
		{ symbol: "BINANCE:BTCUSDT", label: "Bitcoin", type: "crypto" },
		{ symbol: "BINANCE:ETHUSDT", label: "Ethereum", type: "crypto" },
		{ symbol: "USO", label: "Oil (WTI ETF)", type: "commodity" },
	]);

	// Seed YouTube Videos for Local Development
	try {
		const dataPath = path.join(process.cwd(), "db", "data", "youtube.json");
		if (fs.existsSync(dataPath)) {
			const rawData = fs.readFileSync(dataPath, "utf-8");
			const jsonPayload = JSON.parse(rawData);

			const videoInserts = jsonPayload.map((item: any) => {
				// Safely extract a videoId just like the webhook parsing logic
				let finalVideoId = "";
				if (item.videoUrl) {
					try {
						const parsedUrl = new URL(item.videoUrl);
						if (parsedUrl.hostname.includes("youtube.com")) {
							finalVideoId = parsedUrl.searchParams.get("v") || "";
						} else if (parsedUrl.hostname === "youtu.be") {
							finalVideoId = parsedUrl.pathname.slice(1);
						}
					} catch (e) {
						// Fallback if URL is totally unparseable
						finalVideoId = `fallback-${Math.random().toString(36).substring(7)}`;
					}
				}

				return {
					videoId: finalVideoId,
					channelName: item.channelTitle || item.channelName || "Unknown",
					title: item.title,
					url: item.videoUrl || item.url,
					thumbnail: item.thumbnail,
					publishedAt: item.publishedAt,
					isHidden: false,
					isSaved: false
				};
			}).filter((v: any) => v.videoId && v.title && v.channelName); // Drop any completely broken rows

			if (videoInserts.length > 0) {
				await db.insert(YoutubeFeed).values(videoInserts);
				console.log(`Seeded ${videoInserts.length} YouTube videos from youtube.json`);
			}
		} else {
			console.log("No youtube.json found in db/data/. Skipping YouTube seed.");
		}
	} catch (err) {
		console.error("Failed to seed YouTube data:", err);
	}
}
