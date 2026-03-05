import type { APIRoute } from 'astro';
import { db, YoutubeFeed, eq } from 'astro:db';

export const POST: APIRoute = async ({ request }) => {
    try {
        // 1. Basic security check: Did n8n send the secret key?
        // You will need to add N8N_WEBHOOK_SECRET=my-super-secret-password to your .env file
        const authHeader = request.headers.get('Authorization');
        const expectedSecret = import.meta.env.N8N_WEBHOOK_SECRET || "fallback-secret-for-dev";

        // Check if the auth header matches Bearer <token>
        if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
            return new Response(JSON.stringify({ error: "Unauthorized access" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. Parse the incoming JSON from n8n
        const body = await request.json();

        // n8n might send a single object OR an array of 123 objects
        const items = Array.isArray(body) ? body : [body];

        if (items.length === 0) {
            return new Response(JSON.stringify({ error: "Empty payload" }), { status: 400 });
        }

        let insertedCount = 0;
        let skippedCount = 0;

        for (const data of items) {
            // Validate we actually received the required fields for this item
            if (!data.videoId || !data.title || !data.channelName) {
                console.warn("[Webhook] Skipping item with missing fields:", data);
                skippedCount++;
                continue;
            }

            // 3. Check if we already have this video in the database to avoid crashing on duplicate inserts
            const existing = await db.select().from(YoutubeFeed).where(eq(YoutubeFeed.videoId, data.videoId));

            if (existing.length === 0) {
                // 4. Insert the new video row into Astro DB
                await db.insert(YoutubeFeed).values({
                    videoId: data.videoId,
                    channelName: data.channelName,
                    title: data.title,
                    url: data.url || `https://www.youtube.com/watch?v=${data.videoId}`, // Fallback if n8n doesn't send URL directly
                    thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`, // Fallback thumbnail
                    publishedAt: data.publishedAt || new Date().toISOString()
                });
                insertedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`[Webhook] Batch processed: ${insertedCount} inserted, ${skippedCount} skipped.`);

        // Return success to n8n
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("[Webhook Error]:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
