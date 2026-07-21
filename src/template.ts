import templateDefinition from "../templates/operations-insight/template.json" with { type: "json" };

export type ContentMode = "lmx" | "html_mjml";
export type SlotType = "hero" | "introduction" | "diagnostic_section" | "scorecard" | "call_to_action" | "footer";

export interface TemplateSlot {
  id: string;
  type: SlotType;
  required: boolean;
  repeatable: boolean;
  min?: number;
  max?: number;
}

export interface NewsletterTemplate {
  templateId: string;
  version: number;
  status: "active" | "retired";
  contentModes: ContentMode[];
  slots: TemplateSlot[];
  lockedDesign: string[];
  editableContent: string[];
}

export interface NewsletterIssue {
  templateId: string;
  templateVersion: number;
  contentMode: ContentMode;
  hero: unknown;
  introduction: unknown;
  sections: unknown[];
  scorecard?: unknown;
  cta: unknown;
  footer: unknown;
}

export const operationsInsightTemplate = templateDefinition as NewsletterTemplate;

export function validateNewsletterIssue(issue: NewsletterIssue, template = operationsInsightTemplate): void {
  if (issue.templateId !== template.templateId || issue.templateVersion !== template.version) {
    throw new Error("Issue template identity does not match the active template");
  }
  if (!template.contentModes.includes(issue.contentMode)) throw new Error(`Unsupported content mode: ${issue.contentMode}`);
  if (!issue.hero || !issue.introduction || !issue.cta || !issue.footer) throw new Error("hero, introduction, cta, and footer are required");
  const sections = issue.sections ?? [];
  const sectionSlot = template.slots.find((slot) => slot.type === "diagnostic_section");
  if (!sectionSlot || sections.length < (sectionSlot.min ?? 0) || sections.length > (sectionSlot.max ?? Number.MAX_SAFE_INTEGER)) {
    throw new Error(`diagnostic sections must contain between ${sectionSlot?.min ?? 0} and ${sectionSlot?.max ?? "unlimited"} items`);
  }
}

export function listSlotTypes(template = operationsInsightTemplate): SlotType[] {
  return template.slots.map((slot) => slot.type);
}

export function contentSlotGuidance(template = operationsInsightTemplate): string {
  return `Use ${template.templateId} v${template.version}; preserve locked design; provide ${template.slots.filter((s) => s.required).map((s) => s.type).join(", ")}; diagnostic_section repeats ${template.slots.find((s) => s.type === "diagnostic_section")?.min}-${template.slots.find((s) => s.type === "diagnostic_section")?.max} times.`;
}

export function assertKnownSlotType(type: string, template = operationsInsightTemplate): asserts type is SlotType {
  if (!listSlotTypes(template).includes(type as SlotType)) throw new Error(`Unknown template slot type: ${type}`);
}

export function issueHasOptionalScorecard(issue: NewsletterIssue): boolean {
  return issue.scorecard !== undefined;
}

export function isSupportedContentMode(mode: string): mode is ContentMode {
  return mode === "lmx" || mode === "html_mjml";
}

export function templateSummary(template = operationsInsightTemplate) {
  return { templateId: template.templateId, version: template.version, contentModes: template.contentModes, slots: template.slots };
}
