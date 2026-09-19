import { z } from "zod";
import { aiRead } from "@/modules/ai/read-route";
import { proposeTitle } from "@/modules/chat/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A name for a conversation, from its first exchange (docs/adr/0008): a
 * read, on its own route, so a slow model never holds back the person's
 * next line. The proposal is written to the conversation before it is
 * answered; a conversation that already has a title keeps it.
 */
const Body = z.object({ conversationId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  return aiRead(
    request,
    Body,
    (ctx, input, locale) => proposeTitle(ctx, input.conversationId, locale),
    { requireModel: true },
  );
}
