export interface AppConfig {
  loopsApiKey: string;
  loopsBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const loopsApiKey = env.LOOPS_API_KEY?.trim();
  if (!loopsApiKey) {
    throw new Error("Missing required environment variable: LOOPS_API_KEY");
  }

  return {
    loopsApiKey,
    loopsBaseUrl: (env.LOOPS_API_BASE_URL ?? "https://app.loops.so/api").replace(/\/$/, ""),
  };
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function safeConfigSummary(config: AppConfig): object {
  return {
    loopsBaseUrl: config.loopsBaseUrl,
    loopsApiKey: redactSecret(config.loopsApiKey),
  };
}

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function assertNoProductionWritesWithoutApproval(input: {
  isProduction: boolean;
  approvalId?: string;
  operation: "send" | "schedule";
}): void {
  if (input.isProduction && !input.approvalId) {
    throw new Error(
      `Human approval is required before production ${input.operation}; provide approvalId`,
    );
  }
}

export function requireApprovalMatch(input: {
  approvalId?: string;
  campaignId: string;
  contentRevisionId: string;
  audienceFingerprint: string;
  sendMode: "immediate" | "scheduled";
  approvedCampaignId?: string;
  approvedContentRevisionId?: string;
  approvedAudienceFingerprint?: string;
  approvedSendMode?: "immediate" | "scheduled";
}): void {
  if (!input.approvalId) {
    throw new Error("Human approval is required before sending or scheduling");
  }
  const matches =
    input.approvedCampaignId === input.campaignId &&
    input.approvedContentRevisionId === input.contentRevisionId &&
    input.approvedAudienceFingerprint === input.audienceFingerprint &&
    input.approvedSendMode === input.sendMode;
  if (!matches) {
    throw new Error("Approval does not match the current campaign, content, audience, or send mode");
  }
}

export function assertValidSchedule(timestamp: string, now = new Date()): void {
  const scheduled = new Date(timestamp);
  if (Number.isNaN(scheduled.getTime())) throw new Error("scheduledFor must be a valid ISO timestamp");
  if (scheduled.getTime() <= now.getTime()) throw new Error("scheduledFor must be in the future");
}
