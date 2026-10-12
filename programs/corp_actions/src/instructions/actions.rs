use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::error::MorroError;
use crate::events::*;
use crate::math::entitlement_for;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AnnounceArgs {
    pub kind: ActionKind,
    pub settlement_mode: SettlementMode,
    pub record_ts: i64,
    pub payment_ts: i64,
    pub period_start_ts: i64,
    pub period_end_ts: i64,
    pub redeem_bps: u16,
    pub new_maturity_ts: i64,
    pub quorum_bps: u16,
    pub threshold_bps: u16,
    pub vote_end_ts: i64,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Announce<'info> {
    #[account(mut, address = bond.issuer @ MorroError::NotIssuer)]
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        init,
        payer = issuer,
        space = 8 + CorporateAction::INIT_SPACE,
        seeds = [ACTION_SEED, bond.mint.as_ref(), &bond.next_action_id.to_le_bytes()],
        bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_announce(ctx: Context<Announce>, args: AnnounceArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &mut ctx.accounts.bond;
    require!(bond.status == BondStatus::Active, MorroError::BondNotActive);
    require!(args.record_ts > now, MorroError::RecordDateInPast);

    match args.kind {
        ActionKind::Coupon => require!(
            args.payment_ts >= args.record_ts && args.period_end_ts > args.period_start_ts,
            MorroError::InvalidActionParams
        ),
        ActionKind::Redemption => require!(
            args.payment_ts >= args.record_ts
                && args.redeem_bps as u64 == BPS
                && args.period_end_ts >= args.period_start_ts,
            MorroError::InvalidActionParams
        ),
        ActionKind::PartialRedemption => require!(
            args.payment_ts >= args.record_ts
                && args.redeem_bps > 0
                && (args.redeem_bps as u64) < BPS
                && args.period_end_ts >= args.period_start_ts,
            MorroError::InvalidActionParams
        ),
        ActionKind::Vote => require!(
            args.vote_end_ts > args.record_ts
                && args.new_maturity_ts > now
                && args.quorum_bps as u64 <= BPS
                && args.threshold_bps > 0
                && args.threshold_bps as u64 <= BPS,
            MorroError::InvalidActionParams
        ),
    }
    if args.kind.retires() {
        // Holders must still hold the bonds that will be burned, so transfers stop at the record date.
        require!(bond.transfer_lock_ts == 0, MorroError::RedemptionAlreadyOpen);
        bond.transfer_lock_ts = args.record_ts;
    }
    bond.add_pending_record_ts(args.record_ts)?;

    let action = &mut ctx.accounts.action;
    action.mint = bond.mint;
    action.action_id = bond.next_action_id;
    action.kind = args.kind;
    action.status = ActionStatus::Announced;
    action.settlement_mode = args.settlement_mode;
    action.record_ts = args.record_ts;
    action.payment_ts = args.payment_ts;
    action.period_start_ts = args.period_start_ts;
    action.period_end_ts = args.period_end_ts;
    action.redeem_bps = args.redeem_bps;
    action.new_maturity_ts = args.new_maturity_ts;
    action.quorum_bps = args.quorum_bps;
    action.threshold_bps = args.threshold_bps;
    action.vote_end_ts = args.vote_end_ts;
    action.snapshot_digest = [0; 32];
    action.report_hash = [0; 32];
    action.announced_ts = now;
    action.bump = ctx.bumps.action;
    bond.next_action_id += 1;

    emit_cpi!(ActionAnnounced {
        mint: action.mint,
        action: action.key(),
        action_id: action.action_id,
        kind: action.kind,
        record_ts: action.record_ts,
        payment_ts: action.payment_ts,
    });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct SnapshotHolder<'info> {
    /// Anyone may run the snapshot; the payer only funds the Entitlement account.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        mut,
        has_one = mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, bond.mint.as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    /// CHECK: checked against the action and bond.
    #[account(address = bond.mint)]
    pub mint: UncheckedAccount<'info>,
    #[account(
        seeds = [HOLDER_SEED, bond.mint.as_ref(), holder.owner.as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Entitlement::INIT_SPACE,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), holder.owner.as_ref()],
        bump
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_snapshot_holder(ctx: Context<SnapshotHolder>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &ctx.accounts.bond;
    let action = &mut ctx.accounts.action;
    require!(action.status == ActionStatus::Announced, MorroError::InvalidActionStatus);
    require!(now > action.record_ts, MorroError::RecordDateNotReached);

    let holder = &ctx.accounts.holder;
    let balance = holder.history.value_at(action.record_ts);
    require!(balance > 0, MorroError::NoBalanceAtRecord);

    let (amount, bonds_to_retire) =
        entitlement_for(action, balance, bond.face_value, bond.coupon_rate_bps, bond.day_count)?;

    let ent = &mut ctx.accounts.entitlement;
    ent.action = action.key();
    ent.owner = holder.owner;
    ent.balance_at_record = balance;
    ent.amount = amount;
    ent.bonds_to_retire = bonds_to_retire;
    ent.status = EntitlementStatus::Pending;
    ent.settled_ts = 0;
    ent.payment_ref = [0; 32];
    ent.vote = VoteChoice::None;
    ent.bump = ctx.bumps.entitlement;

    action.snapshotted_balance = action
        .snapshotted_balance
        .checked_add(balance)
        .ok_or(MorroError::MathOverflow)?;
    action.total_entitlement = action
        .total_entitlement
        .checked_add(amount)
        .ok_or(MorroError::MathOverflow)?;
    action.holders_snapshotted += 1;
    action.snapshot_digest = hashv(&[
        &action.snapshot_digest,
        holder.owner.as_ref(),
        &balance.to_le_bytes(),
        &amount.to_le_bytes(),
    ])
    .to_bytes();

    emit_cpi!(HolderSnapshotted {
        action: action.key(),
        owner: holder.owner,
        balance_at_record: balance,
        amount,
        bonds_to_retire,
        digest: action.snapshot_digest,
    });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct FinalizeSnapshot<'info> {
    #[account(mut, seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, bond.mint.as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
}

pub fn handle_finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &mut ctx.accounts.bond;
    let action = &mut ctx.accounts.action;
    require!(action.status == ActionStatus::Announced, MorroError::InvalidActionStatus);
    require!(now > action.record_ts, MorroError::RecordDateNotReached);

    let supply_at_record = bond.supply_history.value_at(action.record_ts);
    require!(
        action.snapshotted_balance == supply_at_record,
        MorroError::SnapshotIncomplete
    );
    action.supply_at_record = supply_at_record;
    action.status = if action.kind == ActionKind::Vote {
        ActionStatus::Voting
    } else {
        ActionStatus::Snapshotted
    };
    bond.remove_pending_record_ts(action.record_ts);

    emit_cpi!(SnapshotFinalized {
        action: action.key(),
        supply_at_record,
        holders: action.holders_snapshotted,
        total_entitlement: action.total_entitlement,
        digest: action.snapshot_digest,
    });
    Ok(())
}
