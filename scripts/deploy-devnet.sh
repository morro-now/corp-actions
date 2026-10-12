#!/usr/bin/env bash
# Deploys the Morro program to devnet and creates the demo bond there.
# Needs ~5 SOL on the default Solana CLI wallet (program rent ~3.3 SOL + deploy buffer + ~1.1 SOL demo).
# Get devnet SOL at https://faucet.solana.com
set -euo pipefail
cd "$(dirname "$0")/.."

anchor build
npm run sync-idl
solana program deploy -u devnet \
  --program-id target/deploy/corp_actions-keypair.json \
  target/deploy/corp_actions.so
# Devnet demo state is kept apart from the localnet demo in .demo/
MORRO_DEMO_DIR="$PWD/.demo-devnet" RPC_URL=https://api.devnet.solana.com npm run demo:setup
echo "Deployed. Program: $(solana address -k target/deploy/corp_actions-keypair.json)"
echo "Run the app against devnet with: MORRO_DEMO_DIR=$PWD/.demo-devnet npm run dev"
