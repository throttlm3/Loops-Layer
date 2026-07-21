import { createHash } from "node:crypto";

export type LeadSource = "hubspot" | "instantly" | "personal_list";
export type LeadStatus = "ready" | "quarantined";

export interface LeadProvenance {
  source: LeadSource;
  importId: string;
  rowNumber: number;
}

export interface NormalizedLead {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  role: string;
  source: LeadSource;
  sourceImportId: string;
  rowNumber: number;
  status: LeadStatus;
  quarantineReason?: "missing_email" | "duplicate_email_in_import";
  rowHash: string;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

export function normalizeLead(
  row: Record<string, unknown>,
  provenance: LeadProvenance,
): NormalizedLead {
  const email = normalizeEmail(row.email ?? row.Email);
  const lead: Omit<NormalizedLead, "rowHash"> = {
    email,
    firstName: clean(row.first_name ?? row.firstName ?? row.firstname),
    lastName: clean(row.last_name ?? row.lastName ?? row.lastname),
    company: clean(row.company ?? row.company_name ?? row.companyName),
    role: clean(row.role ?? row.title),
    source: provenance.source,
    sourceImportId: provenance.importId,
    rowNumber: provenance.rowNumber,
    status: email ? "ready" : "quarantined",
    ...(email ? {} : { quarantineReason: "missing_email" as const }),
  };
  return { ...lead, rowHash: fingerprintLead(lead) };
}

export function fingerprintLead(lead: Omit<NormalizedLead, "rowHash"> | NormalizedLead): string {
  const stable = [
    lead.email,
    lead.firstName,
    lead.lastName,
    lead.company,
    lead.role,
    lead.source,
    lead.sourceImportId,
    String(lead.rowNumber),
  ].join("\u001f");
  return createHash("sha256").update(stable).digest("hex");
}

export function parsePersonalLeadCsv(csv: string, provenance: Omit<LeadProvenance, "rowNumber">): NormalizedLead[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const seenEmails = new Set<string>();
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const lead = normalizeLead(row, { ...provenance, rowNumber: index + 2 });
    if (lead.status === "ready" && seenEmails.has(lead.email)) {
      return { ...lead, status: "quarantined", quarantineReason: "duplicate_email_in_import" };
    }
    if (lead.status === "ready") seenEmails.add(lead.email);
    return lead;
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

export function summarizeLeadImport(leads: NormalizedLead[]) {
  return {
    total: leads.length,
    ready: leads.filter((lead) => lead.status === "ready").length,
    quarantined: leads.filter((lead) => lead.status === "quarantined").length,
  };
}
