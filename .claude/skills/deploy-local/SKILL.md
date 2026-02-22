---
description: Deploy the program to a local validator. Use when asked to "deploy locally", "start validator", or "local deployment".
---

Run the local deployment script:

```bash
bash .claude/skills/deploy-local/scripts/deploy.sh
```

Starts a local test validator, deploys the program, and reports the validator PID and program address. Requires `anchor build` to have been run first.

To stop the validator when done, use the `/stop-local` skill.
