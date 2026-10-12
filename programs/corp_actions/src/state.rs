use anchor_lang::prelude::*;

use crate::error::MorroError;

pub const BOND_SEED: &[u8] = b"bond";
pub const HOLDER_SEED: &[u8] = b"holder";
pub const ACTION_SEED: &[u8] = b"action";
pub const ENTITLEMENT_SEED: &[u8] = b"ent";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const EXTRA_METAS_SEED: &[u8] = b"extra-account-metas";

pub const MAX_CHECKPOINTS: usize = 32;
pub const MAX_PENDING_RECORD_DATES: usize = 8;
pub const BPS: u64 = 10_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DayCount {
    /// 30/360 (bond basis): day 31 is treated as day 30.
    Thirty360,
    /// Actual days / 365.
    Act365,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BondStatus {
    Active,
    Redeemed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ActionKind {
    Coupon,
    Redemption,
    PartialRedemption,
    Vote,
}

impl ActionKind {
    pub fn pays(&self) -> bool {
        !matches!(self, ActionKind::Vote)
    }
    pub fn retires(&self) -> bool {
        matches!(self, ActionKind::Redemption | ActionKind::PartialRedemption)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ActionStatus {
    Announced,
    Snapshotted,
    Funded,
    Paying,
    Closed,
    Voting,
    Passed,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum SettlementMode {
    /// tKZT is paid from the action's escrow by the program.
    OnChain,
    /// The program records a payment instruction; the paying agent confirms it.
    OffChain,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum EntitlementStatus {
    Pending,
    Instructed,
    Paid,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum VoteChoice {
    None,
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct Checkpoint {
    pub ts: i64,
    pub value: u64,
}

/// Time-ordered history of a value (a holder's balance or the bond's supply).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct Checkpoints {
    pub len: u8,
    pub items: [Checkpoint; MAX_CHECKPOINTS],
}

impl Checkpoints {
    /// Value as of `ts`: the last checkpoint at or before `ts`, or 0 if none.
    pub fn value_at(&self, ts: i64) -> u64 {
        let items = &self.items[..self.len as usize];
        // Binary search for the first checkpoint strictly after `ts`.
        let idx = items.partition_point(|c| c.ts <= ts);
        if idx == 0 {
            0
        } else {
            items[idx - 1].value
        }
    }

    /// Records `value` at `ts`. A write in the same second overwrites the last entry.
    /// When full, the oldest entry is evicted only if no pending record date still needs it.
    pub fn push(&mut self, ts: i64, value: u64, pending_record_ts: &[i64]) -> Result<()> {
        let len = self.len as usize;
        if len > 0 && self.items[len - 1].ts == ts {
            self.items[len - 1].value = value;
            return Ok(());
        }
        if len == MAX_CHECKPOINTS {
            let (oldest, next) = (self.items[0].ts, self.items[1].ts);
            // Evicting `oldest` changes value_at(r) only for oldest <= r < next.
            let needed = pending_record_ts
                .iter()
                .any(|&r| r != 0 && r >= oldest && r < next);
            require!(!needed, MorroError::CheckpointHistoryFull);
            self.items.copy_within(1.., 0);
            self.items[MAX_CHECKPOINTS - 1] = Checkpoint { ts, value };
        } else {
            self.items[len] = Checkpoint { ts, value };
            self.len += 1;
        }
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct BondConfig {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub registrar: Pubkey,
    pub paying_agent: Pubkey,
    pub settlement_mint: Pubkey,
    /// Face value per bond, in settlement-token minor units (tiyn).
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    pub coupon_freq: u8,
    pub day_count: DayCount,
    pub issue_ts: i64,
    pub maturity_ts: i64,
    pub status: BondStatus,
    /// Non-zero while a redemption is open: transfers are rejected from this time on.
    pub transfer_lock_ts: i64,
    pub next_action_id: u32,
    pub supply: u64,
    pub holder_count: u32,
    /// Record dates whose snapshot is not finalized yet (0 = empty slot).
    pub pending_record_ts: [i64; MAX_PENDING_RECORD_DATES],
    pub supply_history: Checkpoints,
    pub bump: u8,
}

impl BondConfig {
    pub fn add_pending_record_ts(&mut self, ts: i64) -> Result<()> {
        let slot = self
            .pending_record_ts
            .iter_mut()
            .find(|t| **t == 0)
            .ok_or(MorroError::TooManyOpenActions)?;
        *slot = ts;
        Ok(())
    }

    pub fn remove_pending_record_ts(&mut self, ts: i64) {
        if let Some(slot) = self.pending_record_ts.iter_mut().find(|t| **t == ts) {
            *slot = 0;
        }
    }

    pub fn record_supply(&mut self, now: i64) -> Result<()> {
        let pending = self.pending_record_ts;
        self.supply_history.push(now, self.supply, &pending)
    }
}

#[account]
#[derive(InitSpace)]
pub struct HolderRecord {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub kyc_approved: bool,
    pub frozen: bool,
    pub balance: u64,
    pub history: Checkpoints,
    pub bump: u8,
}

impl HolderRecord {
    pub fn set_balance(&mut self, balance: u64, now: i64, pending: &[i64]) -> Result<()> {
        self.balance = balance;
        self.history.push(now, balance, pending)
    }
}

#[account]
#[derive(InitSpace)]
pub struct CorporateAction {
    pub mint: Pubkey,
    pub action_id: u32,
    pub kind: ActionKind,
    pub status: ActionStatus,
    pub settlement_mode: SettlementMode,
    pub record_ts: i64,
    pub payment_ts: i64,
    /// Coupon accrual period; equal values mean no coupon (e.g. partial redemption).
    pub period_start_ts: i64,
    pub period_end_ts: i64,
    /// Share of each holding retired, in bps (10,000 for a full redemption).
    pub redeem_bps: u16,
    pub new_maturity_ts: i64,
    pub quorum_bps: u16,
    pub threshold_bps: u16,
    pub vote_end_ts: i64,
    pub supply_at_record: u64,
    pub snapshotted_balance: u64,
    pub holders_snapshotted: u32,
    pub holders_settled: u32,
    pub total_entitlement: u64,
    pub total_paid: u64,
    pub total_retired: u64,
    pub votes_yes: u64,
    pub votes_no: u64,
    pub snapshot_digest: [u8; 32],
    pub report_hash: [u8; 32],
    pub announced_ts: i64,
    pub closed_ts: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Entitlement {
    pub action: Pubkey,
    pub owner: Pubkey,
    pub balance_at_record: u64,
    /// Cash owed, in settlement-token minor units.
    pub amount: u64,
    pub bonds_to_retire: u64,
    pub status: EntitlementStatus,
    pub settled_ts: i64,
    pub payment_ref: [u8; 32],
    pub vote: VoteChoice,
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_history() -> Checkpoints {
        let mut h = Checkpoints::default();
        for i in 0..MAX_CHECKPOINTS as i64 {
            h.push(100 + i * 10, i as u64, &[]).unwrap();
        }
        h
    }

    #[test]
    fn value_at_reads_the_last_checkpoint_at_or_before_ts() {
        let mut h = Checkpoints::default();
        h.push(100, 5, &[]).unwrap();
        h.push(200, 7, &[]).unwrap();
        assert_eq!(h.value_at(99), 0);
        assert_eq!(h.value_at(100), 5);
        assert_eq!(h.value_at(199), 5);
        assert_eq!(h.value_at(10_000), 7);
    }

    #[test]
    fn same_second_writes_overwrite() {
        let mut h = Checkpoints::default();
        h.push(100, 5, &[]).unwrap();
        h.push(100, 9, &[]).unwrap();
        assert_eq!(h.len, 1);
        assert_eq!(h.value_at(100), 9);
    }

    #[test]
    fn eviction_is_refused_while_an_open_record_date_needs_the_oldest_entry() {
        // Oldest entry covers [100, 110); a record date of 105 still needs it.
        let mut h = full_history();
        assert!(h.push(10_000, 1, &[105]).is_err());
        // A record date outside that window does not block eviction.
        let mut h = full_history();
        h.push(10_000, 1, &[110, 0]).unwrap();
        assert_eq!(h.items[0].ts, 110);
        assert_eq!(h.value_at(10_000), 1);
    }
}
