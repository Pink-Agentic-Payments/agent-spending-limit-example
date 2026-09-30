# Agent spending-policy demo

Plain Node.js (ESM, no dependencies, no SDKs). Requires Node 18+.

## Files

- `policy.js` — the policy engine (`checkPolicy`) and an in-memory `SpendLedger`.
- `pay-tool.js` — wraps a stand-in `executePaymentUnsafe` with `checkPolicy`, so the
  policy check runs *before* the payment executes and the agent has no path to the
  unwrapped function.
- `demo.js` — runs 8 scenarios against one agent's policy and prints the outcome of each.

## Run it

```bash
node demo.js
```

## Actual output (Node v22.21.0, run 2026-09-28)

```
Policy: {
  perTransactionCapUsd: 50,
  dailyCapUsd: 90,
  merchantAllowlist: [ 'openai.com', 'anthropic.com', 'aws.amazon.com' ],
  approvalThresholdUsd: 40
}

1. Normal purchase, allowlisted, under threshold: allowed — within cap, allowlisted, below approval threshold
2. Same amount again but new key (should still be allowed, under daily cap): allowed — within cap, allowlisted, below approval threshold
3. Retry with the SAME idempotency key as #1 (simulates a network-retry double-charge attempt): denied — duplicate idempotency key — already processed today
4. Amount above per-transaction cap: denied — amount $75 exceeds per-transaction cap $50
  -> [approval channel] would notify a human about: $45 to aws.amazon.com
5. Amount at/above approval threshold but under per-transaction cap: pending_approval — amount $45 is >= approval threshold $40
6. Merchant not on the allowlist (simulates a prompt-injected redirect): denied — merchant "totally-not-a-scam.example" is not on the allowlist
7. Another normal purchase (brings today's total to $75 of the $90 daily cap): allowed — within cap, allowlisted, below approval threshold
8. Legitimate small purchase that would push the daily total over the cap: denied — would bring today's total to $105, over daily cap $90

Total spent today for research-agent-01: $75
```

## What this is and isn't

This is a teaching example for the policy-check *pattern* — check-before-execute,
idempotency keys, allowlists, approval thresholds — not a production policy engine.
For production use you'd need: persistent/atomic storage for `SpendLedger` (the
in-memory `Map` here is per-process and not safe under concurrent requests — see
"budget race conditions" in the article), a real approval-notification channel, and
enforcement at the payment provider too (this wrapper is only as strong as the code
path that calls it).

## About

Published by PinkWallet alongside the article [How to Give an AI Agent a Spending Limit](https://dev.to/quinn_854b15f517d8632ed4f/how-to-give-an-ai-agent-a-spending-limit-and-actually-enforce-it-before-it-pays-17nh). Pink Agentic AI Payments (by PinkWallet, early access) is the approval layer between AI agents and company money: plain-language rules, per-agent budgets and human approvals decide each payment before a single-use card or bank transfer is issued. It is in early access: https://pinkwallet.com/agentic/?utm_source=github&utm_campaign=spend-guard-example#early-access. This repo is a teaching example, not that product.

Try the interactive prototype (sample companies, no real money moves): https://claude.ai/public/artifacts/TpsUqLKnqZ3jHpghEGcimx
