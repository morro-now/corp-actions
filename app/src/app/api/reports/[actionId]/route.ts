import fs from "fs";
import { NextResponse } from "next/server";
import { actionPda, buildActionReport, enumName } from "@morro/sdk";
import { ctx } from "@/lib/server/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const id = Number(actionId);
  if (!Number.isInteger(id) || id < 0) return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  const c = ctx();
  const file = c.reportPath(id);
  let body: string;
  if (fs.existsSync(file)) {
    body = fs.readFileSync(file, "utf8");
  } else {
    // The report is deterministic, so a closed action's report can be rebuilt byte for byte from chain data
    // (serverless hosts do not keep the file written at close).
    const key = actionPda(c.mint, id);
    const [bond, action, ents] = await Promise.all([
      c.client.fetchBond(c.mint),
      c.client.fetchAction(key),
      c.client.fetchEntitlements(key),
    ]);
    if (!bond || !action || enumName(action.status) !== "closed") {
      return NextResponse.json({ error: `No published report for action #${id}` }, { status: 404 });
    }
    body = JSON.stringify(buildActionReport(bond, key, action, ents));
  }
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="morro-action-${id}-report.json"`,
      "cache-control": "no-store",
    },
  });
}
