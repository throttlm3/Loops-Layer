import { describe, expect, it } from "vitest";
import { parsePersonalLeadCsv, normalizeLead, fingerprintLead } from "../src/leads.js";

describe("personal lead CSV normalization", () => {
  it("parses and normalizes a valid lead with source provenance", () => {
    const [lead] = parsePersonalLeadCsv(
      "email,first_name,last_name,company,role\nJane@Example.com, Jane, Doe, Acme, CEO\n",
      { importId: "import-1", source: "personal_list" },
    );

    expect(lead).toMatchObject({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
      role: "CEO",
      source: "personal_list",
      sourceImportId: "import-1",
      rowNumber: 2,
    });
    expect(lead.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("quarantines rows without an email instead of guessing", () => {
    const [lead] = parsePersonalLeadCsv("first_name,last_name\nJane,Doe\n", {
      importId: "import-1",
      source: "personal_list",
    });
    expect(lead.status).toBe("quarantined");
    expect(lead.quarantineReason).toBe("missing_email");
  });

  it("marks duplicate emails within one import", () => {
    const leads = parsePersonalLeadCsv(
      "email,first_name\nJane@example.com,Jane\njane@example.com,Janet\n",
      { importId: "import-1", source: "personal_list" },
    );
    expect(leads[0].status).toBe("ready");
    expect(leads[1].status).toBe("quarantined");
    expect(leads[1].quarantineReason).toBe("duplicate_email_in_import");
  });

  it("produces a stable fingerprint for a normalized lead", () => {
    const lead = normalizeLead({ email: "Jane@Example.com", company: "Acme" }, {
      importId: "import-1", source: "personal_list", rowNumber: 2,
    });
    expect(fingerprintLead(lead)).toBe(fingerprintLead({ ...lead }));
  });
});
