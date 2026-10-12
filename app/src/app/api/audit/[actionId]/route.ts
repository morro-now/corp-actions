import { NextResponse } from "next/server";
import { buildAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const id = Number(actionId);
  if (!Number.isInteger(id) || id < 0) return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  try {
    const audit = await buildAudit(id);
    if (!audit) return NextResponse.json({ error: `Action #${id} not found` }, { status: 404 });
    return NextResponse.json(audit, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
