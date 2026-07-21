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
  pagination: { totalResults: number; returnedResults: number; nextCursor: string | null };
  data: CampaignSummary[];
}

export interface EmailMessage {
  id: string;
  campaignId?: string;
  subject?: string;
  previewText?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  lmx?: string;
  contentRevisionId?: string;
  [key: string]: unknown;
}

export interface MailingList {
  id: string;
  name: string;
  description?: string | null;
  isPublic?: boolean;
  [key: string]: unknown;
}

export interface AudienceSegment {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface Contact {
  id?: string;
  email: string;
  userId?: string | null;
  [key: string]: unknown;
}

export class LoopsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LoopsClientOptions) {
    if (!options.apiKey.trim()) throw new Error("Loops API key is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.loops.so/api").replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async checkApiKey(): Promise<ApiKeyContext> {
    return this.request<ApiKeyContext>("/v1/api-key");
  }

  async listCampaigns(options: { perPage?: number; cursor?: string } = {}): Promise<CampaignListResponse> {
    if (options.perPage !== undefined) assertValidPageSize(options.perPage);
    return this.request<CampaignListResponse>(buildQueryPath("/v1/campaigns", options));
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

  async getCampaign(campaignId: string): Promise<CampaignSummary> {
    return this.request<CampaignSummary>(buildCampaignPath(campaignId));
  }

  async getEmailMessage(emailMessageId: string): Promise<EmailMessage> {
    return this.request<EmailMessage>(`/v1/email-messages/${encodeURIComponent(requireId(emailMessageId, "emailMessageId"))}`);
  }

  async listMailingLists(): Promise<MailingList[] | { data: MailingList[] }> {
    return this.request(`/v1/mailing-lists`);
  }

  async listAudienceSegments(): Promise<AudienceSegment[] | { data: AudienceSegment[] }> {
    return this.request(`/v1/audience-segments`);
  }

  async findContact(emailOrUserId: string): Promise<Contact> {
    const value = requireId(emailOrUserId, "emailOrUserId");
    return this.request(`/v1/contacts/find?${new URLSearchParams(value.includes("@") ? { email: value } : { userId: value })}`);
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
    let body: unknown;
    try { body = bodyText ? JSON.parse(bodyText) : undefined; } catch { body = bodyText; }
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

function requireId(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required`);
  return value;
}

function buildQueryPath(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return query.size ? `${path}?${query}` : path;
}

export function buildCampaignPath(campaignId: string): string {
  return `/v1/campaigns/${encodeURIComponent(requireId(campaignId, "campaignId"))}`;
}

export function assertValidPageSize(perPage: number): void {
  if (!Number.isInteger(perPage) || perPage < 10 || perPage > 50) throw new Error("perPage must be an integer between 10 and 50");
}

export function isRetryableLoopsError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status: number }).status;
  return status === 408 || status === 429 || status >= 500;
}

export function normalizeCampaignStatus(status: string): "draft" | "scheduled" | "sending" | "sent" | "unknown" {
  return ({ Draft: "draft", Scheduled: "scheduled", Sending: "sending", Sent: "sent" } as const)[status as "Draft" | "Scheduled" | "Sending" | "Sent"] ?? "unknown";
}

export function createLoopsClient(options: LoopsClientOptions): LoopsClient {
  return new LoopsClient(options);
}

export const LOOPS_API_BASE_URL = "https://app.loops.so/api";
export const LOOPS_APPROVAL_REQUIRED_OPERATIONS = ["send", "schedule"] as const;
export const LOOPS_REPOSITORY_URL = "https://github.com/throttlm3/Loops-Layer";
export const LOOPS_RAW_REQUEST_TOOL_FORBIDDEN = true;
