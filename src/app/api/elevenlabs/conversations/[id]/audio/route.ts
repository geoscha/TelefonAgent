import { type NextRequest } from "next/server";

import { streamConversationAudio } from "@/lib/elevenlabs/stream-conversation-audio";

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
  return streamConversationAudio(params.id, req.headers.get("range"));
}
