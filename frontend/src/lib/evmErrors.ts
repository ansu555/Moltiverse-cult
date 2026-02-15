type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as AnyRecord;
}

function extractQuotedReason(message: string): string | null {
  const patterns = [
    /execution reverted:\s*"([^"]+)"/i,
    /reason="([^"]+)"/i,
    /reverted with reason string '([^']+)'/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function collectCandidateMessages(err: unknown): string[] {
  const out: string[] = [];
  const queue: unknown[] = [err];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === "string") {
      out.push(current);
      continue;
    }

    const obj = asRecord(current);
    if (!obj) continue;

    for (const key of ["reason", "shortMessage", "message"]) {
      const value = obj[key];
      if (typeof value === "string") out.push(value);
    }

    const revert = asRecord(obj.revert);
    const args = revert?.args;
    if (Array.isArray(args) && typeof args[0] === "string") {
      out.push(args[0]);
    }

    queue.push(obj.error, obj.info, obj.data, obj.revert);
  }

  return out;
}

const FRIENDLY_BY_REASON: Record<string, string> = {
  "CULTToken: insufficient balance":
    "Insufficient CULT balance for this transfer.",
  "CULTToken: insufficient CULT for deploy fee":
    "You need at least 100 CULT to deploy.",
  "CULTToken: faucet cooldown active":
    "Faucet cooldown active. Try again after cooldown.",
};

export function getEvmReason(err: unknown): string | null {
  const messages = collectCandidateMessages(err);

  for (const message of messages) {
    if (FRIENDLY_BY_REASON[message]) return message;
    const quotedReason = extractQuotedReason(message);
    if (quotedReason) return quotedReason;
  }

  return null;
}

function isWalletRejected(err: unknown): boolean {
  const obj = asRecord(err);
  if (obj?.code === 4001) return true;

  const reason = getEvmReason(err) || "";
  const normalizedReason = reason.toLowerCase();
  if (
    normalizedReason.includes("user denied") ||
    normalizedReason.includes("user rejected")
  ) {
    return true;
  }

  const messages = collectCandidateMessages(err);
  return messages.some((message) => {
    const value = message.toLowerCase();
    return value.includes("user denied") || value.includes("user rejected");
  });
}

export function getEvmErrorMessage(err: unknown): string {
  if (isWalletRejected(err)) {
    return "Transaction rejected in wallet.";
  }

  const reason = getEvmReason(err);
  if (reason && FRIENDLY_BY_REASON[reason]) {
    return FRIENDLY_BY_REASON[reason];
  }
  if (reason) return reason;

  const messages = collectCandidateMessages(err);
  if (messages.length > 0) return messages[0];

  return "Transaction failed.";
}
