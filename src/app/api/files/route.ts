import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { conversations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { mimeFor } from "@/modules/files/extract";
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  storeFile,
  type UploadResult,
} from "@/modules/files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files in: multipart, one or a few, for a conversation that may not
 * exist yet. Behind the session and workspace guard; a conversation id,
 * when given, is looked up as the caller before a byte is kept. Each
 * file is answered for on its own, so a batch with one bad file loses
 * that one, not the batch.
 */
export async function POST(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (crossSite(request))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const conversationId = String(form.get("conversationId") ?? "") || null;
  if (conversationId !== null) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(conversationId))
      return NextResponse.json({ ok: false, error: "notFound" }, { status: 404 });
    const [own] = await withOrgContext(ctx, (tx) =>
      tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1),
    );
    if (!own) return NextResponse.json({ ok: false, error: "notFound" }, { status: 404 });
  }
  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0 || entries.length > MAX_FILES_PER_UPLOAD)
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const results: Array<{ name: string } & UploadResult> = [];
  for (const entry of entries) {
    if (entry.size > MAX_FILE_BYTES) {
      results.push({ name: entry.name, ok: false, reason: "tooBig" });
      continue;
    }
    const bytes = Buffer.from(await entry.arrayBuffer());
    const stored = await storeFile(ctx, conversationId, {
      name: entry.name,
      mime: mimeFor(entry.name, entry.type),
      bytes,
    });
    results.push({ name: entry.name, ...stored });
  }
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
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
