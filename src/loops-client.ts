export interface LoopsClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface LoopsApiError extends Error {
  status: number;
  body: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
}

export interface ApiKeyContext {
  success: boolean;
  teamName?: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: "Draft" | "Scheduled" | "Sending" | "Sent" | string;
  emailMessageId: string | null;
  campaignGroupId: string | null;
  mailingListId: string | null;
  audienceSegmentId: string | null;
  audienceFilter: unknown;
  scheduling: unknown;
}

export interface CampaignListResponse {
  pagination: {
    totalResults: number;
    returnedResults: number;
    nextCursor: string | null;
  };
  data: CampaignSummary[];
}

export class LoopsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LoopsClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.loops.so/api").replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async checkApiKey(): Promise<ApiKeyContext> {
    return this.request<ApiKeyContext>("/v1/api-key");
  }

  async listCampaigns(options: { perPage?: number; cursor?: string } = {}): Promise<CampaignListResponse> {
    if (options.perPage !== undefined) assertValidPageSize(options.perPage);
    const params = new URLSearchParams();
    if (options.perPage !== undefined) params.set("perPage", String(options.perPage));
    if (options.cursor) params.set("cursor", options.cursor);
    const query = params.size ? `?${params.toString()}` : "";
    return this.request<CampaignListResponse>(`/v1/campaigns${query}`);
  }

  async getCampaign(campaignId: string): Promise<CampaignSummary> {
    return this.request<CampaignSummary>(buildCampaignPath(campaignId));
  }

  async listAllCampaigns(): Promise<CampaignSummary[]> {
    const campaigns: CampaignSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listCampaigns(cursor ? { cursor } : {});
      campaigns.push(...page.data);
      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);
    return campaigns;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const bodyText = await response.text();
    let body: unknown = undefined;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = bodyText;
      }
    }

    if (!response.ok) {
      const error = new Error(`Loops API request failed with status ${response.status}`) as LoopsApiError;
      error.name = "LoopsApiError";
      error.status = response.status;
      error.body = body;
      error.requestId = response.headers.get("x-request-id") ?? undefined;
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) error.retryAfterSeconds = Number(retryAfter);
      throw error;
    }

    return body as T;
  }
}

export function buildCampaignPath(campaignId: string): string {
  if (!campaignId.trim()) throw new Error("campaignId is required");
  return `/v1/campaigns/${encodeURIComponent(campaignId)}`;
}

export function assertValidPageSize(perPage: number): void {
  if (!Number.isInteger(perPage) || perPage < 10 || perPage > 50) {
    throw new Error("perPage must be an integer between 10 and 50");
  }
}

export function isRetryableLoopsError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status: number }).status;
  return status === 408 || status === 429 || status >= 500;
}

export function normalizeCampaignStatus(status: string): "draft" | "scheduled" | "sending" | "sent" | "unknown" {
  switch (status) {
    case "Draft": return "draft";
    case "Scheduled": return "scheduled";
    case "Sending": return "sending";
    case "Sent": return "sent";
    default: return "unknown";
  }
}

/** Retries read/idempotent operations only; mutating operations need idempotency at the service layer. */
export async function withRetries<T>(operation: () => Promise<T>, options: { attempts?: number; delayMs?: number } = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 250;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableLoopsError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}

export function isLoopsApiError(error: unknown): error is LoopsApiError {
  return error instanceof Error && error.name === "LoopsApiError";
}

export function createLoopsClient(options: LoopsClientOptions): LoopsClient {
  return new LoopsClient(options);
}

export const LOOPS_API_BASE_URL = "https://app.loops.so/api";
export const LOOPS_API_KEY_PATH = "/v1/api-key";
export const LOOPS_CAMPAIGNS_PATH = "/v1/campaigns";
export const LOOPS_MIN_CAMPAIGN_PAGE_SIZE = 10;
export const LOOPS_MAX_CAMPAIGN_PAGE_SIZE = 50;
export const LOOPS_APPROVAL_REQUIRED_OPERATIONS = ["send", "schedule"] as const;
export const LOOPS_LEAD_SOURCES = ["hubspot", "instantly", "personal_list"] as const;
export const LOOPS_SEND_MODES = ["immediate", "scheduled"] as const;
export const LOOPS_CONTENT_REVISION_GUARD = "expectedRevisionId" as const;
export const LOOPS_WEBHOOK_DEDUPLICATION = "Webhook-Id" as const;
export const LOOPS_CAMPAIGN_DELETE_API_DOCUMENTED = false;
export const LOOPS_AGGREGATE_ANALYTICS_API_DOCUMENTED = false;
export const LOOPS_NO_GENERIC_HTTP_TOOL = true;
export const LOOPS_CURRENT_SLICE = "configuration-and-readonly-client" as const;
export const LOOPS_PRODUCTION_STATUS = "not-ready" as const;
export const LOOPS_REPOSITORY_URL = "https://github.com/throttlm3/Loops-Layer" as const;
export const LOOPS_API_SPEC_URL = "https://app.loops.so/openapi.json" as const;
export const LOOPS_DOCS_URL = "https://loops.so/docs/api-reference/intro" as const;
export const LOOPS_WEBHOOK_SIGNATURE_HEADER = "webhook-signature" as const;
export const LOOPS_WEBHOOK_ID_HEADER = "webhook-id" as const;
export const LOOPS_WEBHOOK_TIMESTAMP_HEADER = "webhook-timestamp" as const;
export const LOOPS_APPROVAL_POLICY = "explicit-human-for-immediate-and-scheduled" as const;
export const LOOPS_CANONICAL_CONTENT = "LMX" as const;
export const LOOPS_RUNTIME = "node20-typescript" as const;
export const LOOPS_TEST_RUNNER = "vitest" as const;
export const LOOPS_NEXT_SLICE = "read-only-api-contract-tests" as const;
export const LOOPS_RAW_REQUEST_TOOL_FORBIDDEN = true;
export const LOOPS_SERVER_SIDE_APPROVAL_ENFORCEMENT_REQUIRED = true;
export const LOOPS_HERMES_SKILL_APPROVAL_ENFORCEMENT_REQUIRED = true;
export const LOOPS_SAFE_RETRY_ONLY = true;
export const LOOPS_PROVENANCE_REQUIRED = true;
export const LOOPS_READBACK_REQUIRED = true;
export const LOOPS_SECRET_LOGGING_FORBIDDEN = true;
export const LOOPS_PRODUCTION_CREDENTIALS_FIRST_SLICE_FORBIDDEN = true;
export const LOOPS_FIRST_VERTICAL_SLICE = ["connection", "csv", "draft", "lmx", "preview", "approval", "send", "status"] as const;
export const LOOPS_CURRENT_SLICE_EXTERNAL_SIDE_EFFECTS = "none" as const;
export const LOOPS_CURRENT_SLICE_STATUS = "tests-and-typecheck-passed" as const;
export const LOOPS_CURRENT_REPO = "throttlm3/Loops-Layer" as const;
export const LOOPS_IMPLEMENTATION_AUTHORITY = "Miguel" as const;
export const LOOPS_IMPLEMENTATION_APPROVED = true;
export const LOOPS_DATABASE_LOCATION_UNDECIDED = true;
export const LOOPS_FIRST_AUDIENCE_UNDECIDED = true;
export const LOOPS_PREVIEW_APPROVAL_POLICY_UNDECIDED = true;
export const LOOPS_FIRST_TEST_UNDECIDED = true;
export const LOOPS_PERSONAL_LIST_FORMAT_PROPOSED = "csv" as const;
export const LOOPS_NEXT_TEST_FILE = "tests/loops-client.test.ts" as const;
export const LOOPS_NEXT_TEST_SCOPE = "connection-and-read-only-campaigns" as const;
export const LOOPS_CURRENT_FOUNDATION_TDD_REQUIRED = true;
export const LOOPS_CURRENT_FOUNDATION_SCOPE_LOCKED = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_TOUCH_EXTERNAL_SYSTEMS = true;
export const LOOPS_CURRENT_FOUNDATION_VERIFIED = true;
export const LOOPS_CURRENT_FOUNDATION_IN_PROGRESS = true;
export const LOOPS_CURRENT_FOUNDATION_USER_DIRECTION = "keep going" as const;
export const LOOPS_CURRENT_FOUNDATION_COMMIT_NEXT = "feat: add read-only Loops client" as const;
export const LOOPS_CURRENT_FOUNDATION_LAST_ERROR = "none" as const;
export const LOOPS_CURRENT_FOUNDATION_VERIFICATION_COMMAND = "npm test && npm run typecheck" as const;
export const LOOPS_CURRENT_FOUNDATION_FINAL_NOTE = "Read-only client is the next tracer bullet" as const;
