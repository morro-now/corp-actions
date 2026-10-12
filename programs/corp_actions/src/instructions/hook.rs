use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions,
};

use crate::error::MorroError;
use crate::state::*;

/// Accounts in the order Token-2022 passes them to `Execute`, followed by the
/// extras declared in the mint's ExtraAccountMetaList.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint)]
    pub source_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(token::mint = mint)]
    pub destination_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the transfer authority (owner or delegate); not used.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: validated by seeds.
    #[account(seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    /// CHECK: sender's HolderRecord; loaded and verified manually (may equal the receiver's).
    #[account(mut)]
    pub source_holder: UncheckedAccount<'info>,
    /// CHECK: receiver's HolderRecord; may be uninitialized, which rejects the transfer.
    #[account(mut)]
    pub destination_holder: UncheckedAccount<'info>,
}

fn load_holder(info: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<Option<HolderRecord>> {
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(None);
    }
    let record = {
        let data = info.try_borrow_data()?;
        HolderRecord::try_deserialize(&mut &data[..])?
    };
    let expected = Pubkey::create_program_address(
        &[HOLDER_SEED, mint.as_ref(), owner.as_ref(), &[record.bump]],
        &crate::ID,
    )
    .map_err(|_| error!(MorroError::ReceiverNotApproved))?;
    require_keys_eq!(expected, info.key(), MorroError::ReceiverNotApproved);
    require_keys_eq!(record.owner, *owner, MorroError::ReceiverNotApproved);
    Ok(Some(record))
}

fn store_holder(info: &AccountInfo, record: &HolderRecord) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut data;
    record.try_serialize(&mut writer)
}

pub fn handle_transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    // Only act inside a real Token-2022 transfer, never on a direct call.
    {
        let info = ctx.accounts.source_token.to_account_info();
        let data = info.try_borrow_data()?;
        let state = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data)?;
        let ext = state
            .get_extension::<TransferHookAccount>()
            .map_err(|_| MorroError::NotTransferring)?;
        require!(bool::from(ext.transferring), MorroError::NotTransferring);
    }

    let now = Clock::get()?.unix_timestamp;
    let bond = &ctx.accounts.bond;
    require!(bond.status == BondStatus::Active, MorroError::BondNotActive);
    require!(
        bond.transfer_lock_ts == 0 || now < bond.transfer_lock_ts,
        MorroError::TransfersLocked
    );

    let mint = ctx.accounts.mint.key();
    let from_owner = ctx.accounts.source_token.owner;
    let to_owner = ctx.accounts.destination_token.owner;
    let from_info = ctx.accounts.source_holder.to_account_info();
    let to_info = ctx.accounts.destination_holder.to_account_info();

    let mut from = load_holder(&from_info, &mint, &from_owner)?.ok_or(MorroError::HolderNotApproved)?;
    require!(!from.frozen, MorroError::HolderFrozen);
    let mut to = load_holder(&to_info, &mint, &to_owner)?.ok_or(MorroError::ReceiverNotApproved)?;
    require!(to.kyc_approved, MorroError::ReceiverNotApproved);
    require!(!to.frozen, MorroError::HolderFrozen);

    if from_owner == to_owner {
        return Ok(());
    }

    let pending = bond.pending_record_ts;
    let from_balance = from.balance.checked_sub(amount).ok_or(MorroError::MathOverflow)?;
    from.set_balance(from_balance, now, &pending)?;
    let to_balance = to.balance.checked_add(amount).ok_or(MorroError::MathOverflow)?;
    to.set_balance(to_balance, now, &pending)?;
    store_holder(&from_info, &from)?;
    store_holder(&to_info, &to)?;
    Ok(())
}
