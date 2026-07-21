import { describe, expect, it } from "vitest";
import {
  assertKnownSlotType,
  issueHasOptionalScorecard,
  operationsInsightTemplate,
  validateNewsletterIssue,
} from "../src/template.js";

const issue = {
  templateId: "operations-insight",
  templateVersion: 1,
  contentMode: "lmx" as const,
  hero: { title: "Test" },
  introduction: { body: "Intro" },
  sections: [{ title: "One" }],
  cta: { label: "Book", url: "https://throttl.ai" },
  footer: { unsubscribe: true },
};

describe("adaptable newsletter template", () => {
  it("accepts one or more repeatable sections and optional scorecard", () => {
    expect(() => validateNewsletterIssue(issue)).not.toThrow();
    expect(() => validateNewsletterIssue({ ...issue, sections: Array.from({ length: 8 }, () => ({ title: "Section" })) })).not.toThrow();
    expect(issueHasOptionalScorecard(issue)).toBe(false);
  });

  it("rejects more than eight sections", () => {
    expect(() => validateNewsletterIssue({ ...issue, sections: Array.from({ length: 9 }, () => ({ title: "Section" })) })).toThrow("between 1 and 8");
  });

  it("requires core slots", () => {
    expect(() => validateNewsletterIssue({ ...issue, footer: undefined })).toThrow("required");
  });

  it("supports both content modes", () => {
    expect(operationsInsightTemplate.contentModes).toEqual(["lmx", "html_mjml"]);
    expect(() => validateNewsletterIssue({ ...issue, contentMode: "html_mjml" })).not.toThrow();
  });

  it("rejects unknown slot types", () => {
    expect(() => assertKnownSlotType("unknown")).toThrow("Unknown template slot type");
  });
});
