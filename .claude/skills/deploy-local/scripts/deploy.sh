#!/bin/bash
set -e

PROGRAM_ID="48WQW8ZMQKJhV1FKnGrYVDMEoqc8XutQmvKuqcmRrKux"
SO="target/deploy/solana_token.so"
PROGRAM_KEYPAIR="target/deploy/solana_token-keypair.json"
PAYER=$(solana-keygen pubkey ~/.config/solana/id.json)

if [ ! -f "$SO" ]; then
  echo "[deploy-local] ERROR: Program .so file missing. Run /build first." >&2
  exit 1
fi

# Kill any existing validator
if pgrep -f solana-test-validator > /dev/null; then
  echo "[deploy-local] Stopping existing validator..." >&2
  pkill -f solana-test-validator
  sleep 2
fi

echo "[deploy-local] Starting local validator..." >&2
solana-test-validator --reset --quiet --mint "$PAYER" &
VALIDATOR_PID=$!

# Wait for validator to be ready
echo "[deploy-local] Waiting for validator to start..." >&2
for i in $(seq 1 30); do
  if solana cluster-version -u localhost 2>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[deploy-local] ERROR: Validator failed to start." >&2
    kill $VALIDATOR_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

echo "[deploy-local] Deploying program..." >&2
solana program deploy "$SO" --program-id "$PROGRAM_KEYPAIR" -u localhost

echo "[deploy-local] Deployment complete." >&2
echo "[deploy-local] Validator PID: $VALIDATOR_PID" >&2
echo "[deploy-local] Program ID: $PROGRAM_ID" >&2
