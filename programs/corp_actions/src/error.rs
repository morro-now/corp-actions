use anchor_lang::prelude::*;

#[error_code]
pub enum MorroError {
    #[msg("Mint must have 0 decimals and zero supply")]
    InvalidMint,
    #[msg("Mint authority must be the bond PDA")]
    InvalidMintAuthority,
    #[msg("Mint transfer hook must point to this program")]
    InvalidTransferHook,
    #[msg("Mint permanent delegate must be the bond PDA")]
    InvalidPermanentDelegate,
    #[msg("Invalid bond terms")]
    InvalidBondTerms,
    #[msg("Signer is not the issuer")]
    NotIssuer,
    #[msg("Signer is not the registrar")]
    NotRegistrar,
    #[msg("Signer is not the paying agent")]
    NotPayingAgent,
    #[msg("Holder is not KYC-approved")]
    HolderNotApproved,
    #[msg("Holder is frozen")]
    HolderFrozen,
    #[msg("Receiver is not a KYC-approved holder")]
    ReceiverNotApproved,
    #[msg("Bond is no longer active")]
    BondNotActive,
    #[msg("Transfers are locked for an open redemption")]
    TransfersLocked,
    #[msg("Hook called outside a token transfer")]
    NotTransferring,
    #[msg("Invalid action parameters")]
    InvalidActionParams,
    #[msg("Record date must be in the future")]
    RecordDateInPast,
    #[msg("Another redemption is already open")]
    RedemptionAlreadyOpen,
    #[msg("Too many actions awaiting a snapshot")]
    TooManyOpenActions,
    #[msg("Balance history is full and still needed by an open record date; finalize that snapshot first")]
    CheckpointHistoryFull,
    #[msg("Record date has not passed yet")]
    RecordDateNotReached,
    #[msg("Action is not in the required state")]
    InvalidActionStatus,
    #[msg("Holder had no bonds at the record date")]
    NoBalanceAtRecord,
    #[msg("Snapshot is incomplete: snapshotted balance does not equal supply at record date")]
    SnapshotIncomplete,
    #[msg("Action does not pay cash")]
    NotAPaymentAction,
    #[msg("Wrong settlement mode for this instruction")]
    WrongSettlementMode,
    #[msg("Payment date has not been reached")]
    PaymentDateNotReached,
    #[msg("Entitlement is not in the required state")]
    InvalidEntitlementStatus,
    #[msg("A required account is missing")]
    MissingAccount,
    #[msg("Token account does not belong to the holder")]
    WrongTokenAccount,
    #[msg("Not every entitlement has been settled")]
    SettlementIncomplete,
    #[msg("Voting is closed")]
    VotingClosed,
    #[msg("Voting is still open")]
    VotingOpen,
    #[msg("Holder has already voted")]
    AlreadyVoted,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
