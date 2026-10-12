use anchor_lang::prelude::*;

use crate::state::{ActionKind, ActionStatus};

#[event]
pub struct BondInitialized {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    pub maturity_ts: i64,
}

#[event]
pub struct HolderRegistered {
    pub mint: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct HolderStatusChanged {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub kyc_approved: bool,
    pub frozen: bool,
}

#[event]
pub struct BondsIssued {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub supply: u64,
}

#[event]
pub struct ActionAnnounced {
    pub mint: Pubkey,
    pub action: Pubkey,
    pub action_id: u32,
    pub kind: ActionKind,
    pub record_ts: i64,
    pub payment_ts: i64,
}

#[event]
pub struct HolderSnapshotted {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub balance_at_record: u64,
    pub amount: u64,
    pub bonds_to_retire: u64,
    pub digest: [u8; 32],
}

#[event]
pub struct SnapshotFinalized {
    pub action: Pubkey,
    pub supply_at_record: u64,
    pub holders: u32,
    pub total_entitlement: u64,
    pub digest: [u8; 32],
}

#[event]
pub struct EscrowFunded {
    pub action: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EntitlementPaid {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PaymentInstructed {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PaymentConfirmed {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub payment_ref: [u8; 32],
}

#[event]
pub struct BondsRetired {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub supply: u64,
}

#[event]
pub struct VoteCast {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub yes: bool,
    pub weight: u64,
}

#[event]
pub struct VoteFinalized {
    pub action: Pubkey,
    pub votes_yes: u64,
    pub votes_no: u64,
    pub status: ActionStatus,
}

#[event]
pub struct TermsAmended {
    pub mint: Pubkey,
    pub action: Pubkey,
    pub old_maturity_ts: i64,
    pub new_maturity_ts: i64,
}

#[event]
pub struct ActionClosed {
    pub action: Pubkey,
    pub total_paid: u64,
    pub total_retired: u64,
    pub report_hash: [u8; 32],
}
