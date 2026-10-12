use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_token_2022::extension::{
    permanent_delegate::PermanentDelegate, transfer_hook::TransferHook, BaseStateWithExtensions,
    StateWithExtensions,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::error::MorroError;
use crate::events::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitBondArgs {
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    pub coupon_freq: u8,
    pub day_count: DayCount,
    pub issue_ts: i64,
    pub maturity_ts: i64,
    pub registrar: Pubkey,
    pub paying_agent: Pubkey,
}

/// Accounts the transfer hook needs, resolved by Token-2022 on every transfer:
/// 5 = BondConfig, 6 = sender's HolderRecord, 7 = receiver's HolderRecord.
/// Holder records are derived from the `owner` field (bytes 32..64) of each token account.
pub fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: BOND_SEED.to_vec() }, Seed::AccountKey { index: 1 }],
            false,
            false,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: HOLDER_SEED.to_vec() },
                Seed::AccountKey { index: 1 },
                Seed::AccountData { account_index: 0, data_index: 32, length: 32 },
            ],
            false,
            true,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: HOLDER_SEED.to_vec() },
                Seed::AccountKey { index: 1 },
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
            ],
            false,
            true,
        )?,
    ])
}

#[event_cpi]
#[derive(Accounts)]
pub struct InitializeBond<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = issuer,
        space = 8 + BondConfig::INIT_SPACE,
        seeds = [BOND_SEED, mint.key().as_ref()],
        bump
    )]
    pub bond: Box<Account<'info, BondConfig>>,
    /// CHECK: created and written here; layout defined by spl-tlv-account-resolution.
    #[account(
        init,
        payer = issuer,
        space = ExtraAccountMetaList::size_of(3)?,
        seeds = [EXTRA_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_bond(ctx: Context<InitializeBond>, args: InitBondArgs) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let bond_key = ctx.accounts.bond.key();

    require!(mint.decimals == 0 && mint.supply == 0, MorroError::InvalidMint);
    require!(
        mint.mint_authority == Some(bond_key).into(),
        MorroError::InvalidMintAuthority
    );
    {
        let info = mint.to_account_info();
        let data = info.try_borrow_data()?;
        let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)?;
        let hook = state
            .get_extension::<TransferHook>()
            .map_err(|_| MorroError::InvalidTransferHook)?;
        require!(
            Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
            MorroError::InvalidTransferHook
        );
        let delegate = state
            .get_extension::<PermanentDelegate>()
            .map_err(|_| MorroError::InvalidPermanentDelegate)?;
        require!(
            Option::<Pubkey>::from(delegate.delegate) == Some(bond_key),
            MorroError::InvalidPermanentDelegate
        );
    }
    require!(
        args.face_value > 0
            && args.coupon_freq > 0
            && args.coupon_rate_bps <= 100_000
            && args.maturity_ts > args.issue_ts,
        MorroError::InvalidBondTerms
    );

    let bond = &mut ctx.accounts.bond;
    bond.mint = mint.key();
    bond.issuer = ctx.accounts.issuer.key();
    bond.registrar = args.registrar;
    bond.paying_agent = args.paying_agent;
    bond.settlement_mint = ctx.accounts.settlement_mint.key();
    bond.face_value = args.face_value;
    bond.coupon_rate_bps = args.coupon_rate_bps;
    bond.coupon_freq = args.coupon_freq;
    bond.day_count = args.day_count;
    bond.issue_ts = args.issue_ts;
    bond.maturity_ts = args.maturity_ts;
    bond.status = BondStatus::Active;
    bond.transfer_lock_ts = 0;
    bond.next_action_id = 0;
    bond.supply = 0;
    bond.holder_count = 0;
    bond.pending_record_ts = [0; MAX_PENDING_RECORD_DATES];
    bond.supply_history = Checkpoints::default();
    bond.bump = ctx.bumps.bond;

    let metas = extra_account_metas()?;
    let info = ctx.accounts.extra_account_meta_list.to_account_info();
    let mut data = info.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;

    emit_cpi!(BondInitialized {
        mint: bond.mint,
        issuer: bond.issuer,
        face_value: bond.face_value,
        coupon_rate_bps: bond.coupon_rate_bps,
        maturity_ts: bond.maturity_ts,
    });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(mut, address = bond.registrar @ MorroError::NotRegistrar)]
    pub registrar: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    /// CHECK: any wallet; KYC is attested by the registrar's signature.
    pub owner: UncheckedAccount<'info>,
    #[account(
        init,
        payer = registrar,
        space = 8 + HolderRecord::INIT_SPACE,
        seeds = [HOLDER_SEED, bond.mint.as_ref(), owner.key().as_ref()],
        bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
    let holder = &mut ctx.accounts.holder;
    holder.mint = ctx.accounts.bond.mint;
    holder.owner = ctx.accounts.owner.key();
    holder.kyc_approved = true;
    holder.frozen = false;
    holder.balance = 0;
    holder.history = Checkpoints::default();
    holder.bump = ctx.bumps.holder;
    ctx.accounts.bond.holder_count += 1;
    emit_cpi!(HolderRegistered { mint: holder.mint, owner: holder.owner });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct SetHolderStatus<'info> {
    #[account(address = bond.registrar @ MorroError::NotRegistrar)]
    pub registrar: Signer<'info>,
    #[account(seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, bond.mint.as_ref(), holder.owner.as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
}

pub fn handle_set_holder_status(
    ctx: Context<SetHolderStatus>,
    kyc_approved: bool,
    frozen: bool,
) -> Result<()> {
    let holder = &mut ctx.accounts.holder;
    holder.kyc_approved = kyc_approved;
    holder.frozen = frozen;
    emit_cpi!(HolderStatusChanged {
        mint: holder.mint,
        owner: holder.owner,
        kyc_approved,
        frozen,
    });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct Issue<'info> {
    #[account(address = bond.issuer @ MorroError::NotIssuer)]
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(mut, address = bond.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, mint.key().as_ref(), holder.owner.as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = holder.owner,
        token::token_program = token_program
    )]
    pub holder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handle_issue(ctx: Context<Issue>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &ctx.accounts.bond;
    require!(amount > 0, MorroError::InvalidActionParams);
    require!(bond.status == BondStatus::Active, MorroError::BondNotActive);
    require!(bond.transfer_lock_ts == 0, MorroError::TransfersLocked);
    require!(ctx.accounts.holder.kyc_approved, MorroError::HolderNotApproved);
    require!(!ctx.accounts.holder.frozen, MorroError::HolderFrozen);

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[BOND_SEED, mint_key.as_ref(), &[bond.bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.holder_token_account.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    let bond = &mut ctx.accounts.bond;
    let pending = bond.pending_record_ts;
    let holder = &mut ctx.accounts.holder;
    let new_balance = holder.balance.checked_add(amount).ok_or(MorroError::MathOverflow)?;
    holder.set_balance(new_balance, now, &pending)?;
    bond.supply = bond.supply.checked_add(amount).ok_or(MorroError::MathOverflow)?;
    bond.record_supply(now)?;

    emit_cpi!(BondsIssued {
        mint: bond.mint,
        owner: holder.owner,
        amount,
        supply: bond.supply,
    });
    Ok(())
}
