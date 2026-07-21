import { randomUUID } from "node:crypto";

export type SendMode = "immediate" | "scheduled";
export type ApprovalStatus = "pending" | "approved" | "revoked" | "consumed";

export interface AudienceManifest {
  selection: unknown;
  fingerprint: string;
}

export interface SenderIdentity {
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
}

export interface ApprovalRequestInput {
  campaignId: string;
  emailMessageId: string;
  contentRevisionId: string;
  audience: AudienceManifest;
  senderIdentity: SenderIdentity;
  subject: string;
  previewText: string;
  sendMode: SendMode;
  scheduledFor?: string;
  timezone?: string;
  approver: string;
  expiresAt: string;
}

export interface ApprovalManifest extends ApprovalRequestInput {
  id: string;
  createdAt: string;
  status: ApprovalStatus;
}

/**
 * Persistence boundary for approvals. This slice intentionally ships with only
 * an in-memory implementation; production persistence (PostgreSQL) is future work.
 */
export interface ApprovalStore {
  get(id: string): Promise<ApprovalManifest | undefined>;
  create(approval: ApprovalManifest): Promise<void>;
  update(id: string, patch: Partial<Pick<ApprovalManifest, "status">>): Promise<ApprovalManifest>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ApprovalManifest>();

  async get(id: string): Promise<ApprovalManifest | undefined> {
    return this.approvals.get(id);
  }

  async create(approval: ApprovalManifest): Promise<void> {
    if (this.approvals.has(approval.id)) throw new Error(`Approval ${approval.id} already exists`);
    this.approvals.set(approval.id, approval);
  }

  async update(id: string, patch: Partial<Pick<ApprovalManifest, "status">>): Promise<ApprovalManifest> {
    const current = this.approvals.get(id);
    if (!current) throw new Error(`Approval ${id} not found`);
    const updated = { ...current, ...patch };
    this.approvals.set(id, updated);
    return updated;
  }
}

function requireNonEmpty(name: string, value: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function parseDate(name: string, value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be a valid ISO timestamp`);
  return parsed;
}

function validateInput(input: ApprovalRequestInput, now: Date, checkExpiry = true): void {
  for (const [name, value] of [
    ["campaignId", input.campaignId],
    ["emailMessageId", input.emailMessageId],
    ["contentRevisionId", input.contentRevisionId],
    ["audience fingerprint", input.audience.fingerprint],
    ["sender fromEmail", input.senderIdentity.fromEmail],
    ["subject", input.subject],
    ["approver", input.approver],
  ] as const) requireNonEmpty(name, value);

  const expiresAt = parseDate("expiresAt", input.expiresAt);
  if (checkExpiry && expiresAt.getTime() <= now.getTime()) throw new Error("expiresAt must be in the future");

  if (input.sendMode === "scheduled") {
    if (!input.scheduledFor) throw new Error("scheduledFor is required for scheduled mode");
    if (!input.timezone?.trim()) throw new Error("timezone is required for scheduled mode");
    if (parseDate("scheduledFor", input.scheduledFor).getTime() <= now.getTime()) {
      throw new Error("scheduledFor must be in the future");
    }
  } else {
    if (input.scheduledFor !== undefined || input.timezone !== undefined) {
      throw new Error("scheduledFor and timezone are only valid for scheduled mode");
    }
  }
}

function sameContext(a: ApprovalManifest, b: ApprovalRequestInput): boolean {
  return JSON.stringify({
    campaignId: a.campaignId,
    emailMessageId: a.emailMessageId,
    contentRevisionId: a.contentRevisionId,
    audience: a.audience,
    senderIdentity: a.senderIdentity,
    subject: a.subject,
    previewText: a.previewText,
    sendMode: a.sendMode,
    scheduledFor: a.scheduledFor,
    timezone: a.timezone,
  }) === JSON.stringify({
    campaignId: b.campaignId,
    emailMessageId: b.emailMessageId,
    contentRevisionId: b.contentRevisionId,
    audience: b.audience,
    senderIdentity: b.senderIdentity,
    subject: b.subject,
    previewText: b.previewText,
    sendMode: b.sendMode,
    scheduledFor: b.scheduledFor,
    timezone: b.timezone,
  });
}

async function requireApproval(store: ApprovalStore, id: string, input: ApprovalRequestInput, now: Date): Promise<ApprovalManifest> {
  const approval = await store.get(id);
  if (!approval) throw new Error(`Approval ${id} not found`);
  if (!sameContext(approval, input)) throw new Error("Approval does not match the requested execution context");
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) throw new Error("Approval is expired");
  return approval;
}

export async function createApprovalRequest(store: ApprovalStore, input: ApprovalRequestInput, now = new Date()): Promise<ApprovalManifest> {
  validateInput(input, now);
  const approval: ApprovalManifest = { ...input, id: randomUUID(), createdAt: now.toISOString(), status: "pending" };
  await store.create(approval);
  return approval;
}

export async function approveApproval(store: ApprovalStore, id: string, approver: string, now = new Date()): Promise<ApprovalManifest> {
  requireNonEmpty("approver", approver);
  const approval = await store.get(id);
  if (!approval) throw new Error(`Approval ${id} not found`);
  if (approval.status !== "pending") throw new Error(`Approval is ${approval.status}`);
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) throw new Error("Approval is expired");
  if (approval.approver !== approver) throw new Error("Approver does not match the requested approver");
  return store.update(id, { status: "approved" });
}

export async function verifyApprovalForExecution(store: ApprovalStore, id: string, input: ApprovalRequestInput, now = new Date()): Promise<ApprovalManifest> {
  validateInput(input, now, false);
  const approval = await requireApproval(store, id, input, now);
  if (approval.status !== "approved") throw new Error(`Approval is ${approval.status}`);
  return approval;
}

export async function consumeApproval(store: ApprovalStore, id: string, input: ApprovalRequestInput, now = new Date()): Promise<ApprovalManifest> {
  const approval = await verifyApprovalForExecution(store, id, input, now);
  return store.update(approval.id, { status: "consumed" });
}
