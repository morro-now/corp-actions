import "server-only";
import { LangErrorMessage } from "@coral-xyz/anchor";
import { SendTransactionError, type Connection } from "@solana/web3.js";
import idl from "@morro/sdk/src/idl/corp_actions.json";

const PROGRAM_ERRORS = new Map<number, { name: string; msg: string }>(
  (idl.errors ?? []).map((e: { code: number; name: string; msg?: string }) => [e.code, { name: e.name, msg: e.msg ?? "" }]),
);

const TOKEN_ERRORS: Record<number, string> = {
  0x1: "InsufficientFunds: Not enough tokens in the source account",
  0x3: "MintMismatch: Token account does not match the mint",
  0x4: "OwnerMismatch: Signer does not own the token account",
  0x11: "AccountFrozen: Token account is frozen",
};

export interface ParsedError {
  error: string;
  logs: string[];
}

/** Turns a failed send into "ErrorName: message" plus the program logs, preferring Morro's own errors. */
export async function parseTxError(e: unknown, connection?: Connection): Promise<ParsedError> {
  let logs: string[] = [];
  if (e instanceof SendTransactionError) {
    logs = e.logs ?? [];
    if (logs.length === 0 && connection) {
      try {
        logs = (await e.getLogs(connection)) ?? [];
      } catch {
        /* ignore */
      }
    }
  } else if (e && typeof e === "object" && Array.isArray((e as { logs?: unknown }).logs)) {
    logs = (e as { logs: string[] }).logs;
  }
  const message = e instanceof Error ? e.message : String(e);
  const haystack = [...logs, message].join("\n");

  // Anchor: "AnchorError ... Error Code: ReceiverNotApproved. Error Number: 6010. Error Message: Receiver is ...".
  const anchor = haystack.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: ([^\n]*?)\.?(?:\n|$)/);
  if (anchor) return { error: `${anchor[1]}: ${anchor[3]}`, logs };

  // Raw custom program error: map Morro codes, Anchor framework codes and SPL token codes.
  const custom = haystack.match(/custom program error: (0x[0-9a-fA-F]+)/);
  if (custom) {
    const code = parseInt(custom[1], 16);
    const p = PROGRAM_ERRORS.get(code);
    if (p) return { error: `${p.name}: ${p.msg}`, logs };
    const lang = LangErrorMessage.get(code);
    if (lang) return { error: `AnchorError ${code}: ${lang}`, logs };
    if (TOKEN_ERRORS[code]) return { error: TOKEN_ERRORS[code], logs };
    return { error: `Custom program error ${custom[1]}`, logs };
  }
  const first = message.split("\n")[0].replace(/^Simulation failed\.\s*/i, "").trim();
  return { error: first || "Transaction failed", logs };
}
