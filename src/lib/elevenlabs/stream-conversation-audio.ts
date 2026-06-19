import "server-only";

/** Streams ElevenLabs conversation audio (supports Range for seeking). */
export async function streamConversationAudio(
  conversationId: string,
  rangeHeader: string | null
): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY fehlt", { status: 400 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(
      conversationId
    )}/audio`,
    {
      headers: {
        "xi-api-key": apiKey,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      },
      cache: "no-store",
    }
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("Aufnahme nicht verfügbar", {
      status: upstream.status === 200 ? 502 : upstream.status,
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? "audio/mpeg"
  );
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
