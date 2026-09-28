import { checkPolicy } from "./policy.js";

/**
 * A stand-in for whatever the real "pay" tool call is (a payment
 * provider's SDK, an MCP tool, a bank API). It just simulates
 * executing a charge — the point of this file is what happens
 * BEFORE this function is allowed to run, not what's inside it.
 *
 * @param {import("./policy.js").PaymentRequest} req
 */
async function executePaymentUnsafe(req) {
  return {
    status: "executed",
    agentId: req.agentId,
    merchant: req.merchant,
    amountUsd: req.amountUsd,
    idempotencyKey: req.idempotencyKey,
  };
}

/**
 * Wraps executePaymentUnsafe with a policy check that runs first.
 * This is the pattern: the "pay" tool the agent calls is never the
 * raw provider SDK — it's this wrapper. The agent (or a prompt
 * injection controlling the agent) cannot skip the check because
 * it has no path to executePaymentUnsafe directly.
 *
 * @param {import("./policy.js").AgentPolicy} policy
 * @param {import("./policy.js").PaymentRequest} req
 * @param {import("./policy.js").SpendLedger} ledger
 * @param {(req: import("./policy.js").PaymentRequest) => Promise<void>} onApprovalNeeded
 */
export async function pay(policy, req, ledger, onApprovalNeeded) {
  const result = checkPolicy(policy, req, ledger);

  if (result.decision === "deny") {
    return { status: "denied", reason: result.reason, request: req };
  }

  if (result.decision === "require_approval") {
    await onApprovalNeeded(req);
    return { status: "pending_approval", reason: result.reason, request: req };
  }

  // decision === "allow": execute, then record spend so the next
  // check in the same day sees the updated total.
  const executed = await executePaymentUnsafe(req);
  ledger.record(req.agentId, req.idempotencyKey, req.amountUsd);
  return { status: "allowed", reason: result.reason, result: executed };
}
