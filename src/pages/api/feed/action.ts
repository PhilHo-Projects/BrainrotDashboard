import type { APIRoute } from 'astro';
import { db, YoutubeFeed, eq } from 'astro:db';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { videoId, action } = body;

        if (!videoId || !action) {
            return new Response(JSON.stringify({ error: "Missing videoId or action" }), { status: 400 });
        }

        if (action === "hide") {
            await db.update(YoutubeFeed)
                .set({ isHidden: true })
                .where(eq(YoutubeFeed.videoId, videoId));
        } else if (action === "save") {
            // Toggle the saved state
            const video = await db.select().from(YoutubeFeed).where(eq(YoutubeFeed.videoId, videoId));
            if (video.length > 0) {
                await db.update(YoutubeFeed)
                    .set({ isSaved: !video[0].isSaved })
                    .where(eq(YoutubeFeed.videoId, videoId));
            }
        } else {
            return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("[YouTube Action Error]:", error);
        return new Response(JSON.stringify({ error: "Failed to perform action" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
