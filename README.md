# Morro

**Corporate actions, on-chain.** Morro automates coupon payments, redemptions and bondholder votes for tokenized bonds on Solana. For each action it identifies eligible holders at the record date, calculates entitlements, settles them, and records the outcome on-chain where anyone can verify it.

Built for the Superteam Kazakhstan x KASE side track, *Corporate Actions on Blockchain* (Colosseum hackathon).

- **Live demo (Solana devnet)**: https://morro-corp-actions.vercel.app
- **Technical overview** (architecture, record-date logic, entitlements, settlement, Solana components): [`docs/TECHNICAL_OVERVIEW.md`](docs/TECHNICAL_OVERVIEW.md)
- **Program**: [`programs/corp_actions`](programs/corp_actions), program ID `F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq`

## What it does

| Scenario | How |
| --- | --- |
| Coupon payment | Holders are snapshotted as of the record date. The coupon is computed on-chain (30/360 or Act/365), then paid in tKZT from an escrow the issuer funds |
| Bond redemption | Principal plus the final coupon is paid, and the bonds are burned in the same instruction. The bond is then marked Redeemed |
| Bondholder consent vote | Votes are weighted by record-date holdings. If the vote passes, maturity moves on-chain and in the token's metadata |
| Partial early redemption | A pro-rata share of each holding is retired. In the demo it settles through a simulated off-chain paying agent |

Key ideas:

- **A true record date.** A Token-2022 transfer hook writes timestamped balance checkpoints. Trading continues, and snapshots read balances as of `record_ts`.
- **Provably complete snapshots.** A snapshot only finalizes when the snapshotted balances add up to the total supply at the record date.
- **KYC enforced by the token.** The transfer hook rejects any receiver the registrar has not approved.
- **Verifiable from chain data alone.** Accounts, CPI events, a replayable snapshot digest, and a hash of the closing report.

## Repository

```
programs/corp_actions   Anchor program (Rust): registry, snapshots, entitlements, escrow, votes, transfer hook
sdk/                    TypeScript SDK: PDAs, instruction builders, bond mint creation, math, crank, events, reports
services/               Demo setup, crank, simulated paying agent, live end-to-end check
app/                    Next.js web app: overview, issuer console, holder portal, auditor view
tests/                  LiteSVM integration tests (clock-warped full lifecycle)
docs/                   Technical overview
```

## Prerequisites

Rust, the Solana CLI (Agave 2.x+), Anchor CLI 0.32.1, and Node 20+.

```bash
npm install
```

## Build and test

```bash
npm run build:program
```

```bash
npm test
```

`npm test` runs 9 Rust unit tests and 21 LiteSVM integration tests.

## Run the demo locally

Start a local validator with the program loaded, in its own terminal:

```bash
solana-test-validator --reset --bpf-program F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq target/deploy/corp_actions.so
```

Create the demo bond. This makes the role wallets, tKZT, the KZTB-27 mint and three KYC-approved holders, and issues 12,000 / 5,000 / 3,000 bonds:

```bash
npm run demo:setup
```

Run the crank and the simulated paying agent, each in its own terminal (the web app can also trigger them on demand):

```bash
npm run crank
```

```bash
npm run paying-agent
```

Start the web app at http://localhost:3000:

```bash
npm run dev
```

Optionally, run every scenario in real time against the validator with its own throwaway bond:

```bash
npm run e2e:live
```

## Devnet

The program is deployed on devnet: [`F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq`](https://explorer.solana.com/address/F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq?cluster=devnet). A demo bond lives there too: KZTB-27 [`HSMLUrRN1yhKaTCfGhEYnkBV4ku3UDrA34iairMWC6Md`](https://explorer.solana.com/address/HSMLUrRN1yhKaTCfGhEYnkBV4ku3UDrA34iairMWC6Md?cluster=devnet).

Devnet demo state (role keys and config) is kept in `.demo-devnet/`, separate from the localnet demo in `.demo/`. To run the app, crank and paying agent against devnet, set `MORRO_DEMO_DIR`:

```bash
MORRO_DEMO_DIR=$PWD/.demo-devnet npm run dev
```

```bash
MORRO_DEMO_DIR=$PWD/.demo-devnet npm run crank
```

To redeploy and create a fresh devnet bond (needs about 5 devnet SOL on your Solana CLI wallet; [faucet](https://faucet.solana.com)):

```bash
./scripts/deploy-devnet.sh
```

## Demo walkthrough (about 3 minutes)

1. **Overview**: KZTB-27 has a face value of 1,000 KZT and pays 14.50% semi-annually on 30/360. Three holders hold 20,000 bonds in total.
2. **Issuer** announces a coupon with the record date one minute out.
3. **Holder A** sells 2,000 bonds to B before the record date. After it, B sells 1,000 to C. A transfer to the non-KYC "Outsider" wallet is rejected by the hook.
4. The **crank** snapshots holders. Entitlements follow record-date holdings (725,000.00 / 507,500.00 / 217,500.00 KZT), and the "balance = supply" check passes.
5. The **issuer** funds the escrow, the crank pays everyone, and the **holder portal** shows the tKZT arriving.
6. The **issuer** opens a consent vote to extend maturity by six months. A and B vote yes, the vote passes, and the new maturity appears in the token metadata.
7. A **redemption** pays principal plus the final coupon and burns every bond. Supply goes to 0.
8. The **auditor view** replays the events and the snapshot digest, recomputes the report hash, and every check passes.

## Status and limitations

- Settlement uses tKZT, a test SPL token with 2 decimals (tiyn). Off-chain mode shows how cash can stay on existing rails.
- In demo mode the web app signs with server-held keys for each role.
- KYC is a registrar attestation stored on-chain.

The technical overview lists further next steps.
