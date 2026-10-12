import { NextResponse } from "next/server";
import { invalidateState } from "@/lib/server/state";
import { executeOp } from "@/lib/server/tx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { op?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON: { op, params }" }, { status: 400 });
  }
  if (typeof body.op !== "string") return NextResponse.json({ ok: false, error: "Missing op" }, { status: 400 });
  const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
  const { status, body: result } = await executeOp(body.op, params);
  invalidateState();
  return NextResponse.json(result, { status });
}
