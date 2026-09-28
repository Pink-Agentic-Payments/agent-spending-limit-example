import { SpendLedger } from "./policy.js";
import { pay } from "./pay-tool.js";

const policy = {
  perTransactionCapUsd: 50,
  dailyCapUsd: 90,
  merchantAllowlist: ["openai.com", "anthropic.com", "aws.amazon.com"],
  approvalThresholdUsd: 40,
};

const ledger = new SpendLedger();

async function onApprovalNeeded(req) {
  console.log(`  -> [approval channel] would notify a human about: $${req.amountUsd} to ${req.merchant}`);
}

async function run(label, req) {
  const outcome = await pay(policy, req, ledger, onApprovalNeeded);
  console.log(`${label}: ${outcome.status} — ${outcome.reason ?? JSON.stringify(outcome.result)}`);
  return outcome;
}

async function main() {
  console.log("Policy:", policy);
  console.log("");

  await run(
    "1. Normal purchase, allowlisted, under threshold",
    { agentId: "research-agent-01", merchant: "openai.com", amountUsd: 20, idempotencyKey: "req-1" }
  );

  await run(
    "2. Same amount again but new key (should still be allowed, under daily cap)",
    { agentId: "research-agent-01", merchant: "anthropic.com", amountUsd: 20, idempotencyKey: "req-2" }
  );

  await run(
    "3. Retry with the SAME idempotency key as #1 (simulates a network-retry double-charge attempt)",
    { agentId: "research-agent-01", merchant: "openai.com", amountUsd: 20, idempotencyKey: "req-1" }
  );

  await run(
    "4. Amount above per-transaction cap",
    { agentId: "research-agent-01", merchant: "openai.com", amountUsd: 75, idempotencyKey: "req-4" }
  );

  await run(
    "5. Amount at/above approval threshold but under per-transaction cap",
    { agentId: "research-agent-01", merchant: "aws.amazon.com", amountUsd: 45, idempotencyKey: "req-5" }
  );

  await run(
    "6. Merchant not on the allowlist (simulates a prompt-injected redirect)",
    { agentId: "research-agent-01", merchant: "totally-not-a-scam.example", amountUsd: 10, idempotencyKey: "req-6" }
  );

  await run(
    "7. Another normal purchase (brings today's total to $75 of the $90 daily cap)",
    { agentId: "research-agent-01", merchant: "aws.amazon.com", amountUsd: 35, idempotencyKey: "req-7" }
  );

  await run(
    "8. Legitimate small purchase that would push the daily total over the cap",
    { agentId: "research-agent-01", merchant: "openai.com", amountUsd: 30, idempotencyKey: "req-8" }
  );

  console.log("");
  console.log(`Total spent today for research-agent-01: $${ledger.spentTodayUsd("research-agent-01")}`);
}

main();
