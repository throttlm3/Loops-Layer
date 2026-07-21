import { describe, expect, it } from "vitest";
import {
  assertNoProductionWritesWithoutApproval,
  assertValidSchedule,
  loadConfig,
  requireApprovalMatch,
  safeConfigSummary,
} from "../src/config.js";

describe("configuration and approval guards", () => {
  it("requires the Loops API key", () => {
    expect(() => loadConfig({})).toThrow("LOOPS_API_KEY");
  });

  it("loads a key without exposing it in the summary", () => {
    const config = loadConfig({ LOOPS_API_KEY: "loops-secret-1234" });
    expect(config.loopsBaseUrl).toBe("https://app.loops.so/api");
    expect(safeConfigSummary(config)).toEqual({
      loopsBaseUrl: "https://app.loops.so/api",
      loopsApiKey: "loop…1234",
    });
  });

  it("blocks production send without approval", () => {
    expect(() =>
      assertNoProductionWritesWithoutApproval({ isProduction: true, operation: "send" }),
    ).toThrow("approvalId");
  });

  it("requires approval to match the exact send context", () => {
    expect(() =>
      requireApprovalMatch({
        approvalId: "approval-1",
        campaignId: "campaign-1",
        contentRevisionId: "revision-2",
        audienceFingerprint: "audience-b",
        sendMode: "immediate",
        approvedCampaignId: "campaign-1",
        approvedContentRevisionId: "revision-1",
        approvedAudienceFingerprint: "audience-b",
        approvedSendMode: "immediate",
      }),
    ).toThrow("does not match");
  });

  it("rejects a schedule in the past", () => {
    expect(() => assertValidSchedule("2020-01-01T00:00:00Z")).toThrow("future");
  });
});
