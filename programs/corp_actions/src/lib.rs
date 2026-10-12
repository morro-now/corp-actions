//! Morro: corporate actions for tokenized bonds on Solana.
//!
//! One program owns the bond's registry, record-date snapshots, entitlements,
//! settlement escrows and votes, and acts as the bond mint's Token-2022 transfer hook.

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq");

#[program]
pub mod corp_actions {
    use super::*;

    pub fn initialize_bond(ctx: Context<InitializeBond>, args: InitBondArgs) -> Result<()> {
        bond::handle_initialize_bond(ctx, args)
    }

    pub fn register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
        bond::handle_register_holder(ctx)
    }

    pub fn set_holder_status(
        ctx: Context<SetHolderStatus>,
        kyc_approved: bool,
        frozen: bool,
    ) -> Result<()> {
        bond::handle_set_holder_status(ctx, kyc_approved, frozen)
    }

    pub fn issue(ctx: Context<Issue>, amount: u64) -> Result<()> {
        bond::handle_issue(ctx, amount)
    }

    pub fn announce(ctx: Context<Announce>, args: AnnounceArgs) -> Result<()> {
        actions::handle_announce(ctx, args)
    }

    pub fn snapshot_holder(ctx: Context<SnapshotHolder>) -> Result<()> {
        actions::handle_snapshot_holder(ctx)
    }

    pub fn finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
        actions::handle_finalize_snapshot(ctx)
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        settlement::handle_fund_escrow(ctx)
    }

    pub fn distribute(ctx: Context<Distribute>) -> Result<()> {
        settlement::handle_distribute(ctx)
    }

    pub fn confirm_payment(ctx: Context<ConfirmPayment>, payment_ref: [u8; 32]) -> Result<()> {
        settlement::handle_confirm_payment(ctx, payment_ref)
    }

    pub fn close_action(ctx: Context<CloseAction>, report_hash: [u8; 32]) -> Result<()> {
        settlement::handle_close_action(ctx, report_hash)
    }

    pub fn cast_vote(ctx: Context<CastVote>, yes: bool) -> Result<()> {
        vote::handle_cast_vote(ctx, yes)
    }

    pub fn finalize_vote(ctx: Context<FinalizeVote>) -> Result<()> {
        vote::handle_finalize_vote(ctx)
    }

    /// Token-2022 transfer hook: KYC check on the receiver and balance checkpoints.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        hook::handle_transfer_hook(ctx, amount)
    }
}
