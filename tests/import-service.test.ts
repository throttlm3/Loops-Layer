import { describe, expect, it } from "vitest";
import { createImportReport, importPersonalLeadCsv } from "../src/import-service.js";

describe("personal lead import service", () => {
  it("creates a dry-run report without provider writes", () => {
    const report = importPersonalLeadCsv(
      "email,first_name\njane@example.com,Jane\n,Missing\n",
      { importId: "import-1", source: "personal_list" },
    );

    expect(report.mode).toBe("dry_run");
    expect(report.summary).toEqual({ total: 2, ready: 1, quarantined: 1 });
    expect(report.ready).toHaveLength(1);
    expect(report.quarantined[0].quarantineReason).toBe("missing_email");
    expect(report.providerWrites).toBe(0);
  });

  it("rejects an empty import ID", () => {
    expect(() => importPersonalLeadCsv("email\njane@example.com\n", { importId: "", source: "personal_list" })).toThrow(
      "importId",
    );
  });

  it("creates a stable import report fingerprint", () => {
    const first = createImportReport("import-1", importPersonalLeadCsv("email\njane@example.com\n", {
      importId: "import-1", source: "personal_list",
    }).ready);
    const second = createImportReport("import-1", importPersonalLeadCsv("email\njane@example.com\n", {
      importId: "import-1", source: "personal_list",
    }).ready);
    expect(first.importFingerprint).toBe(second.importFingerprint);
  });
});
