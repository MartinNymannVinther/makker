import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { routing } from "@/i18n/routing";
import { classifyAiError } from "@/modules/ai/service";
import { buildDocument } from "@/modules/documents/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A conversation as a Word or PowerPoint file. Behind the session and
 * workspace guard; the conversation is the caller's own or it is not
 * found. Counted as a model call like any other. A model that will not
 * answer is a word in JSON, not a file that is not a file.
 */
const Body = z.object({
  conversationId: z.string().min(1).max(64),
  format: z.enum(["docx", "pptx"]),
});

function refuse(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return refuse("unauthorized", 401);
  if (crossSite(request)) return refuse("unauthorized", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid", 400);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return refuse("invalid", 400);
  const asked = new URL(request.url).searchParams.get("locale");
  const locale = (routing.locales as readonly string[]).includes(asked ?? "")
    ? (asked as string)
    : routing.defaultLocale;

  let built;
  try {
    built = await buildDocument(ctx, parsed.data.conversationId, parsed.data.format, locale);
  } catch (error) {
    const failure = classifyAiError(error);
    return refuse(failure, failure === "rateLimited" ? 429 : 200);
  }
  if (!built) return refuse("notFound", 404);

  return new Response(new Uint8Array(built.bytes), {
    headers: {
      "Content-Type": built.mime,
      "Content-Disposition": `attachment; filename="${built.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
