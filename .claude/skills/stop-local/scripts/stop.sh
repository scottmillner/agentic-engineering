#!/bin/bash

if pgrep -f solana-test-validator > /dev/null; then
  echo "[deploy-local] Stopping validator..." >&2
  pkill -f solana-test-validator
  echo "[deploy-local] Validator stopped." >&2
else
  echo "[deploy-local] No validator running." >&2
fi
