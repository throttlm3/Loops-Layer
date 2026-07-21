import { createHash } from "node:crypto";
import {
  fingerprintLead,
  parsePersonalLeadCsv,
  summarizeLeadImport,
  type LeadSource,
  type NormalizedLead,
} from "./leads.js";

export interface ImportInput {
  importId: string;
  source: LeadSource;
}

export interface ImportReport {
  mode: "dry_run";
  importId: string;
  source: LeadSource;
  summary: ReturnType<typeof summarizeLeadImport>;
  ready: NormalizedLead[];
  quarantined: NormalizedLead[];
  providerWrites: 0;
  importFingerprint: string;
}

export function importPersonalLeadCsv(csv: string, input: ImportInput): ImportReport {
  if (!input.importId.trim()) throw new Error("importId is required");
  const leads = parsePersonalLeadCsv(csv, input);
  return createImportReport(input.importId, leads, input.source);
}

export function createImportReport(
  importId: string,
  leads: NormalizedLead[],
  source: LeadSource = "personal_list",
): ImportReport {
  if (!importId.trim()) throw new Error("importId is required");
  const ready = leads.filter((lead) => lead.status === "ready");
  const quarantined = leads.filter((lead) => lead.status === "quarantined");
  const importFingerprint = createHash("sha256")
    .update(leads.map((lead) => fingerprintLead(lead)).join("\n"))
    .digest("hex");
  return {
    mode: "dry_run",
    importId,
    source,
    summary: summarizeLeadImport(leads),
    ready,
    quarantined,
    providerWrites: 0,
    importFingerprint,
  };
}

export function assertDryRun(report: ImportReport): void {
  if (report.mode !== "dry_run" || report.providerWrites !== 0) {
    throw new Error("Import report is not a side-effect-free dry run");
  }
}

export function assertReportReadyForReview(report: ImportReport): void {
  assertDryRun(report);
  if (!report.importId || !report.importFingerprint) {
    throw new Error("Import report is missing provenance");
  }
}

export function renderImportReport(report: ImportReport): string {
  assertReportReadyForReview(report);
  return [
    `Import ${report.importId}`,
    `Source: ${report.source}`,
    `Mode: ${report.mode}`,
    `Ready: ${report.summary.ready}`,
    `Quarantined: ${report.summary.quarantined}`,
    "Provider writes: 0",
    `Fingerprint: ${report.importFingerprint}`,
  ].join("\n");
}
