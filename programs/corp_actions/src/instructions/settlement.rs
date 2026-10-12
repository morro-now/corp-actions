use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Burn, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::error::MorroError;
use crate::events::*;
use crate::state::*;

/// Burns `amount` bonds from the holder using the bond PDA as permanent delegate,
/// then updates the holder's balance history and the bond's supply history.
#[allow(clippy::too_many_arguments)]
fn retire_bonds<'info>(
    bond: &mut BondConfig,
    bond_info: AccountInfo<'info>,
    holder: &mut HolderRecord,
    action: &mut CorporateAction,
    action_key: Pubkey,
    mint: AccountInfo<'info>,
    from: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    now: i64,
) -> Result<BondsRetired> {
    let seeds: &[&[u8]] = &[BOND_SEED, bond.mint.as_ref(), &[bond.bump]];
    token_interface::burn(
        CpiContext::new_with_signer(
            token_program,
            Burn { mint, from, authority: bond_info },
            &[seeds],
        ),
        amount,
    )?;
    let pending = bond.pending_record_ts;
    let new_balance = holder.balance.checked_sub(amount).ok_or(MorroError::MathOverflow)?;
    holder.set_balance(new_balance, now, &pending)?;
    bond.supply = bond.supply.checked_sub(amount).ok_or(MorroError::MathOverflow)?;
    bond.record_supply(now)?;
    action.total_retired = action.total_retired.checked_add(amount).ok_or(MorroError::MathOverflow)?;
    Ok(BondsRetired { action: action_key, owner: holder.owner, amount, supply: bond.supply })
}

fn mark_settled(action: &mut CorporateAction, ent: &mut Entitlement, now: i64) -> Result<()> {
    ent.status = EntitlementStatus::Paid;
    ent.settled_ts = now;
    action.total_paid = action.total_paid.checked_add(ent.amount).ok_or(MorroError::MathOverflow)?;
    action.holders_settled += 1;
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut, address = bond.issuer @ MorroError::NotIssuer)]
    pub issuer: Signer<'info>,
    #[account(seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, bond.mint.as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(address = bond.settlement_mint, mint::token_program = settlement_token_program)]
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = issuer,
        token::token_program = settlement_token_program
    )]
    pub issuer_settlement_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = issuer,
        seeds = [ESCROW_SEED, action.key().as_ref()],
        bump,
        token::mint = settlement_mint,
        token::authority = action,
        token::token_program = settlement_token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
    let action = &mut ctx.accounts.action;
    require!(action.kind.pays(), MorroError::NotAPaymentAction);
    require!(
        action.settlement_mode == SettlementMode::OnChain,
        MorroError::WrongSettlementMode
    );
    require!(action.status == ActionStatus::Snapshotted, MorroError::InvalidActionStatus);

    let amount = action.total_entitlement;
    if amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.settlement_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.issuer_settlement_account.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.issuer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.settlement_mint.decimals,
        )?;
    }
    action.status = ActionStatus::Funded;
    emit_cpi!(EscrowFunded { action: action.key(), amount });
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct Distribute<'info> {
    /// Anyone may push payments once the payment date is reached.
    pub payer: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(mut, address = bond.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, mint.key().as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(
        mut,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), entitlement.owner.as_ref()],
        bump = entitlement.bump
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, mint.key().as_ref(), entitlement.owner.as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
    /// Required when bonds are retired.
    #[account(
        mut,
        token::mint = mint,
        token::authority = entitlement.owner,
        token::token_program = bond_token_program
    )]
    pub holder_bond_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    #[account(address = bond.settlement_mint, mint::token_program = settlement_token_program)]
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Required for on-chain settlement.
    #[account(mut, seeds = [ESCROW_SEED, action.key().as_ref()], bump)]
    pub escrow: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    /// Required for on-chain settlement.
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = entitlement.owner,
        token::token_program = settlement_token_program
    )]
    pub holder_settlement_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_distribute(ctx: Context<Distribute>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mut retired = None;
    let mut paid = None;
    let mut instructed = None;
    let accounts = &mut *ctx.accounts;
    let action_key = accounts.action.key();
    let action_info = accounts.action.to_account_info();
    let bond_info = accounts.bond.to_account_info();
    let action = &mut accounts.action;
    require!(action.kind.pays(), MorroError::NotAPaymentAction);
    require!(now >= action.payment_ts, MorroError::PaymentDateNotReached);
    require!(
        accounts.entitlement.status == EntitlementStatus::Pending,
        MorroError::InvalidEntitlementStatus
    );

    match action.settlement_mode {
        SettlementMode::OnChain => {
            require!(
                matches!(action.status, ActionStatus::Funded | ActionStatus::Paying),
                MorroError::InvalidActionStatus
            );
            let escrow = accounts.escrow.as_ref().ok_or(MorroError::MissingAccount)?;
            let to = accounts
                .holder_settlement_account
                .as_ref()
                .ok_or(MorroError::MissingAccount)?;
            let amount = accounts.entitlement.amount;
            if amount > 0 {
                let id = action.action_id.to_le_bytes();
                let seeds: &[&[u8]] = &[ACTION_SEED, action.mint.as_ref(), &id, &[action.bump]];
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(
                        accounts.settlement_token_program.to_account_info(),
                        TransferChecked {
                            from: escrow.to_account_info(),
                            mint: accounts.settlement_mint.to_account_info(),
                            to: to.to_account_info(),
                            authority: action_info,
                        },
                        &[seeds],
                    ),
                    amount,
                    accounts.settlement_mint.decimals,
                )?;
            }
            let retire = accounts.entitlement.bonds_to_retire;
            if retire > 0 {
                let from = accounts
                    .holder_bond_account
                    .as_ref()
                    .ok_or(MorroError::MissingAccount)?;
                let event = retire_bonds(
                    &mut accounts.bond,
                    bond_info,
                    &mut accounts.holder,
                    action,
                    action_key,
                    accounts.mint.to_account_info(),
                    from.to_account_info(),
                    accounts.bond_token_program.to_account_info(),
                    retire,
                    now,
                )?;
                retired = Some(event);
            }
            mark_settled(action, &mut accounts.entitlement, now)?;
            paid = Some(EntitlementPaid {
                action: action_key,
                owner: accounts.entitlement.owner,
                amount,
            });
        }
        SettlementMode::OffChain => {
            require!(
                matches!(action.status, ActionStatus::Snapshotted | ActionStatus::Paying),
                MorroError::InvalidActionStatus
            );
            accounts.entitlement.status = EntitlementStatus::Instructed;
            instructed = Some(PaymentInstructed {
                action: action_key,
                owner: accounts.entitlement.owner,
                amount: accounts.entitlement.amount,
            });
        }
    }
    action.status = ActionStatus::Paying;

    if let Some(event) = retired {
        emit_cpi!(event);
    }
    if let Some(event) = paid {
        emit_cpi!(event);
    }
    if let Some(event) = instructed {
        emit_cpi!(event);
    }
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct ConfirmPayment<'info> {
    #[account(address = bond.paying_agent @ MorroError::NotPayingAgent)]
    pub paying_agent: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(mut, address = bond.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, mint.key().as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(
        mut,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), entitlement.owner.as_ref()],
        bump = entitlement.bump
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, mint.key().as_ref(), entitlement.owner.as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, HolderRecord>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = entitlement.owner,
        token::token_program = bond_token_program
    )]
    pub holder_bond_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    pub bond_token_program: Program<'info, Token2022>,
}

pub fn handle_confirm_payment(ctx: Context<ConfirmPayment>, payment_ref: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mut retired = None;
    let accounts = &mut *ctx.accounts;
    let action_key = accounts.action.key();
    let bond_info = accounts.bond.to_account_info();
    let action = &mut accounts.action;
    require!(
        action.settlement_mode == SettlementMode::OffChain,
        MorroError::WrongSettlementMode
    );
    require!(action.status == ActionStatus::Paying, MorroError::InvalidActionStatus);
    require!(
        accounts.entitlement.status == EntitlementStatus::Instructed,
        MorroError::InvalidEntitlementStatus
    );

    let retire = accounts.entitlement.bonds_to_retire;
    if retire > 0 {
        let from = accounts
            .holder_bond_account
            .as_ref()
            .ok_or(MorroError::MissingAccount)?;
        let event = retire_bonds(
            &mut accounts.bond,
            bond_info,
            &mut accounts.holder,
            action,
            action_key,
            accounts.mint.to_account_info(),
            from.to_account_info(),
            accounts.bond_token_program.to_account_info(),
            retire,
            now,
        )?;
        retired = Some(event);
    }
    accounts.entitlement.payment_ref = payment_ref;
    mark_settled(action, &mut accounts.entitlement, now)?;
    let confirmed = PaymentConfirmed {
        action: action_key,
        owner: accounts.entitlement.owner,
        amount: accounts.entitlement.amount,
        payment_ref,
    };

    if let Some(event) = retired {
        emit_cpi!(event);
    }
    emit_cpi!(confirmed);
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct CloseAction<'info> {
    #[account(mut, address = bond.issuer @ MorroError::NotIssuer)]
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [BOND_SEED, bond.mint.as_ref()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondConfig>>,
    #[account(
        mut,
        constraint = action.mint == bond.mint @ MorroError::InvalidActionParams,
        seeds = [ACTION_SEED, bond.mint.as_ref(), &action.action_id.to_le_bytes()],
        bump = action.bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(address = bond.settlement_mint, mint::token_program = settlement_token_program)]
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Required for on-chain settlement: emptied and closed.
    #[account(mut, seeds = [ESCROW_SEED, action.key().as_ref()], bump)]
    pub escrow: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    /// Receives any escrow remainder (zero when every entitlement was paid).
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = issuer,
        token::token_program = settlement_token_program
    )]
    pub issuer_settlement_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_action(ctx: Context<CloseAction>, report_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let accounts = &mut *ctx.accounts;
    let action_info = accounts.action.to_account_info();
    let action = &mut accounts.action;
    require!(action.kind.pays(), MorroError::NotAPaymentAction);
    require!(
        matches!(
            action.status,
            ActionStatus::Snapshotted | ActionStatus::Funded | ActionStatus::Paying
        ),
        MorroError::InvalidActionStatus
    );
    require!(
        action.holders_settled == action.holders_snapshotted,
        MorroError::SettlementIncomplete
    );

    if let Some(escrow) = accounts.escrow.as_ref() {
        let id = action.action_id.to_le_bytes();
        let seeds: &[&[u8]] = &[ACTION_SEED, action.mint.as_ref(), &id, &[action.bump]];
        let issuer_account = accounts
            .issuer_settlement_account
            .as_ref()
            .ok_or(MorroError::MissingAccount)?;
        if escrow.amount > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    accounts.settlement_token_program.to_account_info(),
                    TransferChecked {
                        from: escrow.to_account_info(),
                        mint: accounts.settlement_mint.to_account_info(),
                        to: issuer_account.to_account_info(),
                        authority: action_info.clone(),
                    },
                    &[seeds],
                ),
                escrow.amount,
                accounts.settlement_mint.decimals,
            )?;
        }
        token_interface::close_account(CpiContext::new_with_signer(
            accounts.settlement_token_program.to_account_info(),
            CloseAccount {
                account: escrow.to_account_info(),
                destination: accounts.issuer.to_account_info(),
                authority: action_info,
            },
            &[seeds],
        ))?;
    } else {
        require!(
            action.settlement_mode == SettlementMode::OffChain || action.holders_snapshotted == 0,
            MorroError::MissingAccount
        );
    }

    action.status = ActionStatus::Closed;
    action.closed_ts = now;
    action.report_hash = report_hash;

    let bond = &mut accounts.bond;
    if action.kind.retires() {
        bond.transfer_lock_ts = 0;
        if action.kind == ActionKind::Redemption && bond.supply == 0 {
            bond.status = BondStatus::Redeemed;
        }
    }

    let closed = ActionClosed {
        action: action.key(),
        total_paid: action.total_paid,
        total_retired: action.total_retired,
        report_hash,
    };
    emit_cpi!(closed);
    Ok(())
}
