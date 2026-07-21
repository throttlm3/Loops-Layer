import { describe, expect, it } from "vitest";
import {
  InMemoryApprovalStore,
  approveApproval,
  consumeApproval,
  createApprovalRequest,
  verifyApprovalForExecution,
  type ApprovalRequestInput,
} from "../src/approval-manifest.js";

const request: ApprovalRequestInput = {
  campaignId: "campaign-1",
  emailMessageId: "message-1",
  contentRevisionId: "revision-1",
  audience: { selection: { mailingListId: "list-1" }, fingerprint: "audience-fingerprint-1" },
  senderIdentity: { fromName: "Throttl", fromEmail: "sender@example.com" },
  subject: "A subject",
  previewText: "Preview text",
  sendMode: "scheduled",
  scheduledFor: "2030-01-02T03:04:05.000Z",
  timezone: "America/New_York",
  approver: "approver@example.com",
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function setup(now = new Date("2029-12-01T00:00:00.000Z")) {
  const store = new InMemoryApprovalStore();
  return { store, now };
}

describe("approval manifest", () => {
  it("creates a pending manifest from the exact send context", async () => {
    const { store, now } = setup();
    const approval = await createApprovalRequest(store, request, now);

    expect(approval).toMatchObject({ ...request, status: "pending", createdAt: now.toISOString() });
    expect(approval.id).toEqual(expect.any(String));
    expect(await store.get(approval.id)).toEqual(approval);
  });

  it("rejects execution when approval is missing", async () => {
    const { store, now } = setup();
    await expect(verifyApprovalForExecution(store, "missing", request, now)).rejects.toThrow("not found");
  });

  it.each([
    ["content revision", { contentRevisionId: "revision-2" }],
    ["audience selection", { audience: { selection: { mailingListId: "list-2" }, fingerprint: request.audience.fingerprint } }],
    ["audience fingerprint", { audience: { selection: request.audience.selection, fingerprint: "audience-fingerprint-2" } }],
    ["send mode", { sendMode: "immediate", scheduledFor: undefined, timezone: undefined }],
    ["schedule timestamp", { scheduledFor: "2030-01-02T04:04:05.000Z" }],
    ["schedule timezone", { timezone: "UTC" }],
  ] as const)("rejects a mismatched %s", async (_label, change) => {
    const { store, now } = setup();
    const approval = await createApprovalRequest(store, request, now);
    await approveApproval(store, approval.id, "approver@example.com", now);

    await expect(
      verifyApprovalForExecution(store, approval.id, { ...request, ...change }, now),
    ).rejects.toThrow("does not match");
  });

  it("requires schedule details for scheduled mode and forbids them for immediate mode", async () => {
    const { store, now } = setup();
    await expect(createApprovalRequest(store, { ...request, scheduledFor: undefined, timezone: undefined }, now)).rejects.toThrow("scheduledFor");
    await expect(createApprovalRequest(store, { ...request, sendMode: "immediate", scheduledFor: request.scheduledFor }, now)).rejects.toThrow("scheduledFor");
  });

  it("approves an approval and allows it to be consumed only once", async () => {
    const { store, now } = setup();
    const approval = await createApprovalRequest(store, request, now);
    const approved = await approveApproval(store, approval.id, "approver@example.com", now);

    expect(approved.status).toBe("approved");
    await expect(consumeApproval(store, approval.id, request, new Date("2029-12-02T00:00:00.000Z"))).resolves.toMatchObject({ status: "consumed" });
    await expect(consumeApproval(store, approval.id, request, new Date("2029-12-02T00:00:00.000Z"))).rejects.toThrow("consumed");
  });

  it("rejects expired approvals", async () => {
    const { store, now } = setup();
    const approval = await createApprovalRequest(store, request, now);
    await approveApproval(store, approval.id, "approver@example.com", now);

    await expect(verifyApprovalForExecution(store, approval.id, request, new Date("2030-01-01T00:00:00.001Z"))).rejects.toThrow("expired");
  });

  it("rejects revoked approvals", async () => {
    const { store, now } = setup();
    const approval = await createApprovalRequest(store, request, now);
    await store.update(approval.id, { status: "revoked" });

    await expect(verifyApprovalForExecution(store, approval.id, request, now)).rejects.toThrow("revoked");
  });
});