use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_2022_extensions::spl_token_metadata_interface::state::Field;
use anchor_spl::token_2022_extensions::{token_metadata_update_field, TokenMetadataUpdateField};
use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};

use crate::error::MorroError;
use crate::events::*;
use crate::math::format_date;
use crate::state::*;

pub const MATURITY_METADATA_KEY: &str = "maturity";

#[event_cpi]
#[derive(Accounts)]
pub struct CastVote<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [ACTION_SEED, action.mint.as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(
        mut,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), owner.key().as_ref()],
        bump = entitlement.bump
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
}

pub fn handle_cast_vote(ctx: Context<CastVote>, yes: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let action = &mut ctx.accounts.action;
    let ent = &mut ctx.accounts.entitlement;
    require!(action.status == ActionStatus::Voting, MorroError::InvalidActionStatus);
    require!(now < action.vote_end_ts, MorroError::VotingClosed);
    require!(ent.vote == VoteChoice::None, MorroError::AlreadyVoted);

    let weight = ent.balance_at_record;
    if yes {
        ent.vote = VoteChoice::Yes;
        action.votes_yes = action.votes_yes.checked_add(weight).ok_or(MorroError::MathOverflow)?;
    } else {
        ent.vote = VoteChoice::No;
        action.votes_no = action.votes_no.checked_add(weight).ok_or(MorroError::MathOverflow)?;
    }
    emit_cpi!(VoteCast { action: action.key(), owner: ent.owner, yes, weight });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct FinalizeVote<'info> {
    #[account(mut, seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    /// CHECK: the bond mint; its metadata is updated when terms change.
    #[account(mut, address = bond.mint)]
    pub mint: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, mint.key().as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub token_program: Program<'info, Token2022>,
}

/// Quorum is measured against supply at the record date; the threshold against votes cast.
pub fn vote_passes(yes: u64, no: u64, supply: u64, quorum_bps: u16, threshold_bps: u16) -> bool {
    let turnout = yes as u128 + no as u128;
    let quorum_met = turnout * BPS as u128 >= quorum_bps as u128 * supply as u128;
    let threshold_met = yes as u128 * BPS as u128 >= threshold_bps as u128 * turnout;
    turnout > 0 && quorum_met && threshold_met
}

pub fn handle_finalize_vote(ctx: Context<FinalizeVote>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let action = &mut ctx.accounts.action;
    require!(action.status == ActionStatus::Voting, MorroError::InvalidActionStatus);
    require!(now >= action.vote_end_ts, MorroError::VotingOpen);

    let passed = vote_passes(
        action.votes_yes,
        action.votes_no,
        action.supply_at_record,
        action.quorum_bps,
        action.threshold_bps,
    );
    action.status = if passed { ActionStatus::Passed } else { ActionStatus::Rejected };
    action.closed_ts = now;

    if passed {
        let bond = &mut ctx.accounts.bond;
        let old_maturity_ts = bond.maturity_ts;
        bond.maturity_ts = action.new_maturity_ts;

        let has_metadata = {
            let data = ctx.accounts.mint.try_borrow_data()?;
            let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)?;
            state.get_extension_types()?.contains(&ExtensionType::TokenMetadata)
        };
        if has_metadata {
            let mint_key = ctx.accounts.mint.key();
            let seeds: &[&[u8]] = &[BOND_SEED, mint_key.as_ref(), &[bond.bump]];
            token_metadata_update_field(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TokenMetadataUpdateField {
                        program_id: ctx.accounts.token_program.to_account_info(),
                        metadata: ctx.accounts.mint.to_account_info(),
                        update_authority: bond.to_account_info(),
                    },
                    &[seeds],
                ),
                Field::Key(MATURITY_METADATA_KEY.to_string()),
                format_date(bond.maturity_ts),
            )?;
        }
        emit_cpi!(TermsAmended {
            mint: bond.mint,
            action: action.key(),
            old_maturity_ts,
            new_maturity_ts: bond.maturity_ts,
        });
    }

    emit_cpi!(VoteFinalized {
        action: action.key(),
        votes_yes: action.votes_yes,
        votes_no: action.votes_no,
        status: action.status,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::vote_passes;

    #[test]
    fn quorum_is_against_supply_and_threshold_against_votes_cast() {
        // 16,000 yes / 4,000 no of 20,000: quorum 100%, 80% yes.
        assert!(vote_passes(16_000, 4_000, 20_000, 5_000, 6_667));
        // 60% yes misses a 2/3 threshold.
        assert!(!vote_passes(6_000, 4_000, 20_000, 5_000, 6_667));
        // Unanimous but only 40% turnout misses a 50% quorum.
        assert!(!vote_passes(8_000, 0, 20_000, 5_000, 6_667));
        // Nobody voted.
        assert!(!vote_passes(0, 0, 20_000, 0, 6_667));
    }
}
