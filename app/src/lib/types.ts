// Serialized shapes shared by the API routes and the browser. No chain libraries here.

export const ROLE_NAMES = [
  "issuer",
  "registrar",
  "payingAgent",
  "crank",
  "holderA",
  "holderB",
  "holderC",
  "outsider",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const HOLDER_ROLES: RoleName[] = ["holderA", "holderB", "holderC", "outsider"];

export type ActionKind = "coupon" | "redemption" | "partialRedemption" | "vote";
export type ActionStatus =
  | "announced"
  | "snapshotted"
  | "funded"
  | "paying"
  | "closed"
  | "voting"
  | "passed"
  | "rejected";
export type SettlementMode = "onChain" | "offChain";
export type EntitlementStatus = "pending" | "instructed" | "paid";
export type VoteChoice = "none" | "yes" | "no";

export interface ConfigView {
  rpcUrl: string;
  cluster: "localnet" | "devnet" | "custom";
  programId: string;
  mint: string;
  settlementMint: string;
  settlementDecimals: number;
  roles: Record<RoleName, string>;
  roleLabels: Record<RoleName, string>;
}

export interface BondView {
  address: string;
  mint: string;
  issuer: string;
  registrar: string;
  payingAgent: string;
  settlementMint: string;
  faceValue: string;
  couponRateBps: number;
  couponFreq: number;
  dayCount: "thirty360" | "act365";
  issueTs: number;
  maturityTs: number;
  status: "active" | "redeemed";
  transferLockTs: number;
  nextActionId: number;
  supply: string;
  holderCount: number;
  pendingRecordTs: number[];
}

export interface MetadataView {
  name: string;
  symbol: string;
  uri: string;
  fields: Record<string, string>;
}

export interface WalletView {
  role: RoleName;
  label: string;
  address: string;
  sol: number;
  bondBalance: string;
  cashBalance: string;
  registered: boolean;
  kycApproved: boolean;
  frozen: boolean;
  recordBalance: string;
}

export interface HolderView {
  address: string;
  owner: string;
  role: RoleName | null;
  label: string;
  kycApproved: boolean;
  frozen: boolean;
  balance: string;
  bondBalance: string;
  cashBalance: string;
}

export interface EntitlementView {
  address: string;
  owner: string;
  ownerRole: RoleName | null;
  ownerLabel: string;
  balanceAtRecord: string;
  amount: string;
  bondsToRetire: string;
  status: EntitlementStatus;
  settledTs: number;
  paymentRef: string;
  vote: VoteChoice;
}

export interface ActionView {
  address: string;
  actionId: number;
  kind: ActionKind;
  status: ActionStatus;
  settlementMode: SettlementMode;
  recordTs: number;
  paymentTs: number;
  periodStartTs: number;
  periodEndTs: number;
  redeemBps: number;
  newMaturityTs: number;
  quorumBps: number;
  thresholdBps: number;
  voteEndTs: number;
  supplyAtRecord: string;
  snapshottedBalance: string;
  holdersSnapshotted: number;
  holdersSettled: number;
  totalEntitlement: string;
  totalPaid: string;
  totalRetired: string;
  votesYes: string;
  votesNo: string;
  snapshotDigest: string;
  reportHash: string;
  announcedTs: number;
  closedTs: number;
  escrowBalance: string | null;
  reportAvailable: boolean;
  entitlements: EntitlementView[];
}

export interface StateView {
  config: ConfigView;
  chainTime: number;
  serverTime: number;
  bond: BondView | null;
  metadata: MetadataView | null;
  holders: HolderView[];
  wallets: WalletView[];
  actions: ActionView[];
}

export interface TxResult {
  ok: boolean;
  signature?: string;
  signatures?: string[];
  explorerUrl?: string;
  log?: string[];
  error?: string;
  logs?: string[];
  actionId?: number;
}

export interface AuditCheck {
  label: string;
  pass: boolean | null;
  detail: string;
}

export interface AuditEvent {
  name: string;
  data: Record<string, unknown>;
  signature: string;
  slot: number;
  blockTime: number | null;
  explorerUrl: string;
}

export interface RailEntry {
  ref: string;
  railReference: string;
  owner: string;
  amountMinor: string;
  paidAt: string;
  signature?: string;
}

export interface AuditView {
  action: ActionView;
  events: AuditEvent[];
  checks: AuditCheck[];
  rail: RailEntry[];
  hashes: { onChain: string; recomputed: string | null; savedFile: string | null };
  reportAvailable: boolean;
}
