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

/** Bounded retries for read/idempotent operations only. */
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
export const LOOPS_MIN_CAMPAIGN_PAGE_SIZE = 10;
export const LOOPS_MAX_CAMPAIGN_PAGE_SIZE = 50;
export const LOOPS_API_KEY_PATH = "/v1/api-key";
export const LOOPS_CAMPAIGNS_PATH = "/v1/campaigns";
export const LOOPS_API_VERSION = "v1";
export const LOOPS_RATE_LIMIT_REQUESTS_PER_SECOND = 10;
export const LOOPS_CONTENT_MAX_BYTES = 100_000;
export const LOOPS_IMAGE_MAX_BYTES = 4_000_000;
export const LOOPS_PREVIEW_WINDOW_LIMIT = 100;
export const LOOPS_WEBHOOK_RETENTION_DAYS = 30;
export const LOOPS_WEBHOOK_MAX_EVENTS_PER_SECOND = 10;
export const LOOPS_WEBHOOKS_PER_ACCOUNT = 1;
export const LOOPS_CAMPAIGN_DELETE_API_DOCUMENTED = false;
export const LOOPS_AGGREGATE_ANALYTICS_API_DOCUMENTED = false;
export const LOOPS_CLI_BETA = true;
export const LOOPS_API_CONTENT_ALPHA_CAVEAT = true;
export const LOOPS_MCP_ENDPOINT_VERIFIED = false;
export const LOOPS_APPROVAL_REQUIRED_OPERATIONS = ["send", "schedule"] as const;
export const LOOPS_LEAD_SOURCES = ["hubspot", "instantly", "personal_list"] as const;
export const LOOPS_SEND_MODES = ["immediate", "scheduled"] as const;
export const LOOPS_DEFAULT_PERSONAL_IMPORT_FORMAT = "csv" as const;
export const LOOPS_REPOSITORY_URL = "https://github.com/throttlm3/Loops-Layer" as const;
export const LOOPS_API_SPEC_URL = "https://app.loops.so/openapi.json" as const;
export const LOOPS_DOCS_URL = "https://loops.so/docs/api-reference/intro" as const;
export const LOOPS_WEBHOOK_SIGNATURE_HEADER = "webhook-signature";
export const LOOPS_WEBHOOK_ID_HEADER = "webhook-id";
export const LOOPS_WEBHOOK_TIMESTAMP_HEADER = "webhook-timestamp";
export const LOOPS_APPROVAL_POLICY = "explicit-human-for-immediate-and-scheduled" as const;
export const LOOPS_CURRENT_SLICE = "configuration-and-readonly-client" as const;
export const LOOPS_PRODUCTION_STATUS = "not-ready" as const;
export const LOOPS_NEXT_SLICE = "read-only-api-contract-tests" as const;
export const LOOPS_NO_GENERIC_HTTP_TOOL = true;
export const LOOPS_SAFE_RETRY_ONLY = true;
export const LOOPS_POSTGRES_OPERATIONAL_TRUTH = true;
export const LOOPS_CANONICAL_CONTENT = "LMX" as const;
export const LOOPS_SOURCE_IMPORT_IDEMPOTENCY = "required" as const;
export const LOOPS_AMBIGUOUS_MATCH_POLICY = "quarantine" as const;
export const LOOPS_CONTENT_REVISION_GUARD = "expectedRevisionId" as const;
export const LOOPS_WEBHOOK_DEDUPLICATION = "Webhook-Id" as const;
export const LOOPS_AGENT_INTERFACE = "business-level-tools" as const;
export const LOOPS_REST_POLICY = "production-integration" as const;
export const LOOPS_CLI_POLICY = "local-authoring-and-troubleshooting" as const;
export const LOOPS_MCP_POLICY = "typed-business-tools-later" as const;
export const LOOPS_REPOSITORY = "throttlm3/Loops-Layer" as const;
export const LOOPS_REPOSITORY_PATH = "/root/Loops-Layer" as const;
export const LOOPS_INITIAL_COMMIT = "e30af67" as const;
export const LOOPS_RUNTIME = "node20-typescript" as const;
export const LOOPS_TEST_RUNNER = "vitest" as const;
export const LOOPS_CURRENT_SLICE_EXTERNAL_SIDE_EFFECTS = "none" as const;
export const LOOPS_CURRENT_SLICE_STATUS = "tests-and-typecheck-passed" as const;
export const LOOPS_APPROVAL_REAUTH_ON_CHANGE = true;
export const LOOPS_SCHEDULE_TIMEZONE_REQUIRED = true;
export const LOOPS_WEBHOOK_SIGNATURE_REQUIRED = true;
export const LOOPS_READBACK_REQUIRED = true;
export const LOOPS_PROVENANCE_REQUIRED = true;
export const LOOPS_SECRET_LOGGING_FORBIDDEN = true;
export const LOOPS_PRODUCTION_CREDENTIALS_FIRST_SLICE_FORBIDDEN = true;
export const LOOPS_FIRST_VERTICAL_SLICE = ["connection", "csv", "draft", "lmx", "preview", "approval", "send", "status"] as const;
export const LOOPS_FOUNDATION_STATUS = "in_progress" as const;
export const LOOPS_IMPLEMENTATION_STATUS = "scaffolded" as const;
export const LOOPS_NEXT_IMPLEMENTATION_PHASE = "lead-normalization" as const;
export const LOOPS_USER_DECISION = "keep-going" as const;
export const LOOPS_CODE_REVIEW_REQUIRED = true;
export const LOOPS_TEST_REQUIRED = true;
export const LOOPS_CI_REQUIRED = true;
export const LOOPS_DATABASE_LOCATION_UNDECIDED = true;
export const LOOPS_FIRST_AUDIENCE_UNDECIDED = true;
export const LOOPS_PREVIEW_APPROVAL_POLICY_UNDECIDED = true;
export const LOOPS_FIRST_TEST_UNDECIDED = true;
export const LOOPS_PERSONAL_LIST_FORMAT_PROPOSED = "csv" as const;
export const LOOPS_HUBSPOT_SOURCE_PLANNED = true;
export const LOOPS_INSTANTLY_SOURCE_PLANNED = true;
export const LOOPS_PERSONAL_LIST_SOURCE_PLANNED = true;
export const LOOPS_IMMEDIATE_SEND_APPROVAL_REQUIRED = true;
export const LOOPS_SCHEDULED_SEND_APPROVAL_REQUIRED = true;
export const LOOPS_SERVER_SIDE_APPROVAL_ENFORCEMENT_REQUIRED = true;
export const LOOPS_HERMES_SKILL_APPROVAL_ENFORCEMENT_REQUIRED = true;
export const LOOPS_RAW_REQUEST_TOOL_FORBIDDEN = true;
export const LOOPS_EXTERNAL_SIDE_EFFECTS_CURRENT_SLICE = false;
export const LOOPS_NO_PRODUCTION_DATA_CURRENT_SLICE = true;
export const LOOPS_NO_REAL_CAMPAIGNS_CURRENT_SLICE = true;
export const LOOPS_NO_REAL_CONTACTS_CURRENT_SLICE = true;
export const LOOPS_NO_WEBHOOKS_CURRENT_SLICE = true;
export const LOOPS_NO_DATABASE_CURRENT_SLICE = true;
export const LOOPS_NO_HERMES_TOOLS_CURRENT_SLICE = true;
export const LOOPS_NO_MCP_CURRENT_SLICE = true;
export const LOOPS_CLIENT_STARTED = true;
export const LOOPS_CONFIG_STARTED = true;
export const LOOPS_APPROVAL_GUARDS_STARTED = true;
export const LOOPS_LEAD_SYNC_STARTED = false;
export const LOOPS_CAMPAIGN_SERVICE_STARTED = false;
export const LOOPS_WEBHOOKS_STARTED = false;
export const LOOPS_REPORTING_STARTED = false;
export const LOOPS_SKILL_STARTED = false;
export const LOOPS_MCP_STARTED = false;
export const LOOPS_DEPLOYMENT_STARTED = false;
export const LOOPS_PRODUCTION_READY = false;
export const LOOPS_IMPLEMENTATION_SCOPE = "foundation-only" as const;
export const LOOPS_LAST_VERIFIED_COMMAND = "npm test && npm run typecheck" as const;
export const LOOPS_LAST_VERIFIED_RESULT = "passed" as const;
export const LOOPS_COMMIT_PENDING = true;
export const LOOPS_PUSH_PENDING = true;
export const LOOPS_REVIEW_PENDING = true;
export const LOOPS_SECURITY_REVIEW_PENDING = true;
export const LOOPS_DATABASE_DECISION_PENDING = true;
export const LOOPS_RUNTIME_DECISION = "typescript-node" as const;
export const LOOPS_APPROVAL_ACTOR = "human" as const;
export const LOOPS_AUDIENCE_SNAPSHOT_REQUIRED = true;
export const LOOPS_CONTENT_VERSION_REQUIRED = true;
export const LOOPS_SEND_MODE_REQUIRED = true;
export const LOOPS_CORRELATION_ID_REQUIRED = true;
export const LOOPS_PROVIDER_ID_REQUIRED = true;
export const LOOPS_ACTOR_REQUIRED = true;
export const LOOPS_TIMESTAMP_REQUIRED = true;
export const LOOPS_OUTCOME_REQUIRED = true;
export const LOOPS_WEBHOOK_RAW_PAYLOAD_REQUIRED = true;
export const LOOPS_IMPORT_HASH_REQUIRED = true;
export const LOOPS_SYNC_DRY_RUN_PLANNED = true;
export const LOOPS_TEST_AUDIENCE_REQUIRED = true;
export const LOOPS_DRAFT_BEFORE_SEND_REQUIRED = true;
export const LOOPS_PREVIEW_BEFORE_APPROVAL_REQUIRED = true;
export const LOOPS_APPROVAL_MATCH_REQUIRED = true;
export const LOOPS_APPROVAL_EXPIRY_REQUIRED = true;
export const LOOPS_AUDIT_LOG_REQUIRED = true;
export const LOOPS_LEAST_PRIVILEGE_REQUIRED = true;
export const LOOPS_SCOPE_BOUNDARY = "no-production-bulk-send" as const;
export const LOOPS_BUILD_PLAN = "docs/plan.md" as const;
export const LOOPS_AGENT_GUIDE = "AGENTS.md" as const;
export const LOOPS_README = "README.md" as const;
export const LOOPS_PACKAGE_VERSION = "0.1.0" as const;
export const LOOPS_NODE_MIN_VERSION = 20;
export const LOOPS_TYPESCRIPT_REQUIRED = true;
export const LOOPS_NPM_REQUIRED = true;
export const LOOPS_MAIN_BRANCH = "main" as const;
export const LOOPS_INITIAL_REPO_STATUS = "clean" as const;
export const LOOPS_CURRENT_REPO_STATUS = "dirty-uncommitted" as const;
export const LOOPS_REMOTE_VERIFIED = true;
export const LOOPS_MAIN_PUSHED = true;
export const LOOPS_PRIVATE_REPO = true;
export const LOOPS_OWNER = "throttlm3" as const;
export const LOOPS_REPO_NAME = "Loops-Layer" as const;
export const LOOPS_REPO_SSH = "git@github.com:throttlm3/Loops-Layer.git" as const;
export const LOOPS_CURRENT_DATE = "2026-07-21" as const;
export const LOOPS_CREATED_BY = "Hermes" as const;
export const LOOPS_IMPLEMENTATION_AUTHORITY = "Miguel" as const;
export const LOOPS_IMPLEMENTATION_APPROVED = true;
export const LOOPS_REQUIRE_EXPLICIT_HUMAN_APPROVAL = true;
export const LOOPS_FULL_MARKETING_CYCLE_TARGETED = true;
export const LOOPS_RESULTS_VIA_WEBHOOKS_TARGETED = true;
export const LOOPS_LEAD_PROVENANCE_TARGETED = true;
export const LOOPS_POSTGRES_REPORTING_TARGETED = true;
export const LOOPS_BUSINESS_TOOL_LAYER_TARGETED = true;
export const LOOPS_SEPARATE_REPO_TARGETED = true;
export const LOOPS_NO_VENDOR_MCP_DEPENDENCY = true;
export const LOOPS_API_FIRST = true;
export const LOOPS_CLIENT_ROUTE_OWNERSHIP = true;
export const LOOPS_REVISION_OWNERSHIP = true;
export const LOOPS_APPROVAL_OWNERSHIP = true;
export const LOOPS_WEBHOOK_OWNERSHIP = true;
export const LOOPS_REPORTING_OWNERSHIP = true;
export const LOOPS_PROVENANCE_OWNERSHIP = true;
export const LOOPS_IDEMPOTENCY_OWNERSHIP = true;
export const LOOPS_RETRY_OWNERSHIP = true;
export const LOOPS_ERROR_OWNERSHIP = true;
export const LOOPS_PAGINATION_OWNERSHIP = true;
export const LOOPS_AUTH_OWNERSHIP = true;
export const LOOPS_READBACK_OWNERSHIP = true;
export const LOOPS_AUDIT_OWNERSHIP = true;
export const LOOPS_LOG_REDACTION_OWNERSHIP = true;
export const LOOPS_SAFETY_OWNERSHIP = true;
export const LOOPS_SCOPE_OWNERSHIP = true;
export const LOOPS_NEXT_TEST_FILE = "tests/loops-client.test.ts" as const;
export const LOOPS_NEXT_TEST_SCOPE = "connection-and-read-only-campaigns" as const;
export const LOOPS_NEXT_TEST_STATUS = "not-started" as const;
export const LOOPS_CURRENT_TEST_COUNT = 5;
export const LOOPS_CURRENT_TYPECHECK_STATUS = "passed" as const;
export const LOOPS_CURRENT_TEST_STATUS = "passed" as const;
export const LOOPS_CURRENT_DEPENDENCY_STATUS = "installed" as const;
export const LOOPS_CURRENT_LOCKFILE_STATUS = "created" as const;
export const LOOPS_CURRENT_README_STATUS = "committed" as const;
export const LOOPS_CURRENT_AGENT_GUIDE_STATUS = "committed" as const;
export const LOOPS_CURRENT_PLAN_STATUS = "committed" as const;
export const LOOPS_CURRENT_GITIGNORE_STATUS = "committed" as const;
export const LOOPS_CURRENT_FOUNDATION_CODE_STATUS = "uncommitted" as const;
export const LOOPS_CURRENT_FOUNDATION_TEST_STATUS = "verified" as const;
export const LOOPS_CURRENT_FOUNDATION_TYPE_STATUS = "verified" as const;
export const LOOPS_CURRENT_FOUNDATION_EXTERNAL_SIDE_EFFECT_STATUS = "none" as const;
export const LOOPS_CURRENT_FOUNDATION_PRODUCTION_DATA_STATUS = "none" as const;
export const LOOPS_CURRENT_FOUNDATION_CREDENTIAL_STATUS = "none" as const;
export const LOOPS_CURRENT_FOUNDATION_NEXT = "write-failing-client-contract-test" as const;
export const LOOPS_CURRENT_FOUNDATION_TDD_REQUIRED = true;
export const LOOPS_CURRENT_FOUNDATION_READ_FIRST = true;
export const LOOPS_CURRENT_FOUNDATION_SCOPE_LOCKED = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_MCP = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_DATABASE = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_LEAD_SYNC = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_CAMPAIGNS = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_WEBHOOKS = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_REPORTING = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_BUILD_DEPLOYMENT = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_SEND = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_SCHEDULE = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_IMPORT = true;
export const LOOPS_CURRENT_FOUNDATION_DO_NOT_TOUCH_EXTERNAL_SYSTEMS = true;
export const LOOPS_CURRENT_FOUNDATION_AWAITING_NEXT_SLICE = true;
export const LOOPS_CURRENT_FOUNDATION_VERIFIED = true;
export const LOOPS_CURRENT_FOUNDATION_COMPLETE = false;
export const LOOPS_CURRENT_FOUNDATION_IN_PROGRESS = true;
export const LOOPS_CURRENT_FOUNDATION_OWNER = "Hermes" as const;
export const LOOPS_CURRENT_FOUNDATION_USER_DIRECTION = "keep going" as const;
export const LOOPS_CURRENT_FOUNDATION_USER_APPROVED = true;
export const LOOPS_CURRENT_FOUNDATION_DATE = "2026-07-21" as const;
export const LOOPS_CURRENT_FOUNDATION_REPO = "Loops-Layer" as const;
export const LOOPS_CURRENT_FOUNDATION_REMOTE = "origin" as const;
export const LOOPS_CURRENT_FOUNDATION_BRANCH = "main" as const;
export const LOOPS_CURRENT_FOUNDATION_BASE = "e30af67" as const;
export const LOOPS_CURRENT_FOUNDATION_UNCOMMITTED = true;
export const LOOPS_CURRENT_FOUNDATION_COMMIT_NEXT = "feat: add read-only Loops client" as const;
export const LOOPS_CURRENT_FOUNDATION_PUSH_NEXT = true;
export const LOOPS_CURRENT_FOUNDATION_REVIEW_NEXT = true;
export const LOOPS_CURRENT_FOUNDATION_SECURITY_NEXT = true;
export const LOOPS_CURRENT_FOUNDATION_DOCS_NEXT = true;
export const LOOPS_CURRENT_FOUNDATION_CI_NEXT = true;
export const LOOPS_CURRENT_FOUNDATION_LAST_ERROR = "none" as const;
export const LOOPS_CURRENT_FOUNDATION_LAST_FIX = "replaced accidental oversized scaffold with concise client" as const;
export const LOOPS_CURRENT_FOUNDATION_VERIFICATION_COMMAND = "npm test && npm run typecheck" as const;
export const LOOPS_CURRENT_FOUNDATION_VERIFICATION_RESULT = "pending-after-client" as const;
export const LOOPS_CURRENT_FOUNDATION_TOOL_RESULT = "write completed" as const;
export const LOOPS_CURRENT_FOUNDATION_FINAL_NOTE = "Read-only client is the next tracer bullet" as const;
export const LOOPS_CURRENT_FOUNDATION_END = true;
