// A minimal, provider-agnostic spending-policy engine.
// No SDK, no network calls — this is the logic you'd wrap around
// whatever "pay" tool your MCP server, agent framework, or payment
// provider actually exposes.

/**
 * @typedef {Object} AgentPolicy
 * @property {number} perTransactionCapUsd
 * @property {number} dailyCapUsd
 * @property {string[]} merchantAllowlist   // exact hostnames, lowercase
 * @property {number} approvalThresholdUsd  // >= this amount requires human approval
 */

/**
 * @typedef {Object} PaymentRequest
 * @property {string} agentId
 * @property {string} merchant   // hostname, e.g. "openai.com"
 * @property {number} amountUsd
 * @property {string} idempotencyKey
 */

/**
 * In-memory ledger of spend-per-agent-per-day. A real implementation
 * needs this to be atomic/shared storage (see "budget race conditions"
 * in the article) — a plain object is only safe for a single-process demo.
 */
export class SpendLedger {
  constructor() {
    /** @type {Map<string, {day: string, totalUsd: number, seenKeys: Set<string>}>} */
    this.byAgent = new Map();
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _bucket(agentId) {
    const today = this._today();
    let bucket = this.byAgent.get(agentId);
    if (!bucket || bucket.day !== today) {
      bucket = { day: today, totalUsd: 0, seenKeys: new Set() };
      this.byAgent.set(agentId, bucket);
    }
    return bucket;
  }

  spentTodayUsd(agentId) {
    return this._bucket(agentId).totalUsd;
  }

  alreadyProcessed(agentId, idempotencyKey) {
    return this._bucket(agentId).seenKeys.has(idempotencyKey);
  }

  record(agentId, idempotencyKey, amountUsd) {
    const bucket = this._bucket(agentId);
    bucket.seenKeys.add(idempotencyKey);
    bucket.totalUsd += amountUsd;
  }
}

/**
 * Evaluate a proposed payment against an agent's policy.
 * Returns a decision BEFORE any money moves. Never executes the payment itself.
 *
 * @param {AgentPolicy} policy
 * @param {PaymentRequest} req
 * @param {SpendLedger} ledger
 * @returns {{decision: "allow"|"require_approval"|"deny", reason: string}}
 */
export function checkPolicy(policy, req, ledger) {
  if (req.amountUsd <= 0) {
    return { decision: "deny", reason: "non-positive amount" };
  }

  // Idempotency: a retried request with the same key must not be
  // treated as a new charge by the policy layer.
  if (ledger.alreadyProcessed(req.agentId, req.idempotencyKey)) {
    return { decision: "deny", reason: "duplicate idempotency key — already processed today" };
  }

  const merchant = req.merchant.toLowerCase();
  if (!policy.merchantAllowlist.includes(merchant)) {
    return { decision: "deny", reason: `merchant "${merchant}" is not on the allowlist` };
  }

  if (req.amountUsd > policy.perTransactionCapUsd) {
    return {
      decision: "deny",
      reason: `amount $${req.amountUsd} exceeds per-transaction cap $${policy.perTransactionCapUsd}`,
    };
  }

  const projectedTotal = ledger.spentTodayUsd(req.agentId) + req.amountUsd;
  if (projectedTotal > policy.dailyCapUsd) {
    return {
      decision: "deny",
      reason: `would bring today's total to $${projectedTotal}, over daily cap $${policy.dailyCapUsd}`,
    };
  }

  if (req.amountUsd >= policy.approvalThresholdUsd) {
    return {
      decision: "require_approval",
      reason: `amount $${req.amountUsd} is >= approval threshold $${policy.approvalThresholdUsd}`,
    };
  }

  return { decision: "allow", reason: "within cap, allowlisted, below approval threshold" };
}
