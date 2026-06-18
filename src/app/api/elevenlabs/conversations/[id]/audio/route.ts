import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Streams the recording of an ElevenLabs conversation through the server so the
 * xi-api-key never reaches the browser. Forwards Range requests so the audio
 * element can seek.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY fehlt", { status: 400 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(
      params.id
    )}/audio`,
    {
      headers: {
        "xi-api-key": apiKey,
        ...(range ? { Range: range } : {}),
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
