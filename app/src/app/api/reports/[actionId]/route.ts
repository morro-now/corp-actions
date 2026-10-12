import fs from "fs";
import { NextResponse } from "next/server";
import { ctx } from "@/lib/server/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const id = Number(actionId);
  if (!Number.isInteger(id) || id < 0) return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  const file = ctx().reportPath(id);
  if (!fs.existsSync(file)) return NextResponse.json({ error: `No published report for action #${id}` }, { status: 404 });
  return new NextResponse(fs.readFileSync(file), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="morro-action-${id}-report.json"`,
      "cache-control": "no-store",
    },
  });
}
