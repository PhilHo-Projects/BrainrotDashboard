import type { APIRoute } from 'astro';
import { db, YoutubeFeed, desc, eq } from 'astro:db';

export const GET: APIRoute = async () => {
    try {
        // Fetch videos, newest first, limit to 50 for performance, exclude hidden videos
        const videos = await db.select()
            .from(YoutubeFeed)
            .where(eq(YoutubeFeed.isHidden, false))
            .orderBy(desc(YoutubeFeed.publishedAt))
            .limit(50);

        return new Response(JSON.stringify(videos), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("[YouTube Feed Error]:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch youtube feed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
