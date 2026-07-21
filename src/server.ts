import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createLoopsClient, isRetryableLoopsError, type LoopsClient } from "./loops-client.js";

export type LoopsToolClient = Pick<LoopsClient,
  | "checkApiKey" | "listCampaigns" | "listAllCampaigns" | "getCampaign" | "getEmailMessage"
  | "listMailingLists" | "listAudienceSegments" | "getAudienceSegment" | "findContact"
  | "createCampaign" | "updateCampaign" | "updateEmailMessage" | "previewEmailMessage" | "createUpload"
  | "listThemes" | "getTheme" | "listComponents" | "getComponent" | "listContactProperties"
>;

type ToolResult = { content: [{ type: "text"; text: string }]; isError?: boolean };

export function formatToolResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function formatToolError(error: unknown): ToolResult {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const rawStatus = candidate.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  const requestId = typeof candidate.requestId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate.requestId) ? candidate.requestId : undefined;
  const code = candidate.name === "LoopsApiError" || typeof candidate.status === "number" ? "LOOPS_API_ERROR" : "LOOPS_TOOL_ERROR";
  const safeError: Record<string, unknown> = {
    code,
    message: candidate.name === "LoopsApiError" || typeof candidate.status === "number" ? "Loops API request failed" : "Loops tool operation failed",
    status,
    retryable: isRetryableLoopsError({ status }),
  };
  if (requestId) safeError.requestId = requestId;
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: safeError }, null, 2) }] };
}

async function call<T>(operation: () => Promise<T>): Promise<ToolResult> {
  try { return formatToolResult(await operation()); } catch (error) { return formatToolError(error); }
}

export function createLoopsMcpServer(loops: LoopsToolClient): McpServer {
  const server = new McpServer({ name: "throttl-loops", version: "0.1.0" });
  server.registerTool("check_connection", { description: "Validate the configured Loops API key and return team context. Read-only." }, () => call(() => loops.checkApiKey()));
  server.registerTool("list_campaigns", { description: "List Loops campaigns. Read-only.", inputSchema: { perPage: z.number().int().min(10).max(50).optional(), cursor: z.string().optional() } }, ({ perPage, cursor }) => call(() => loops.listCampaigns({ perPage, cursor })));
  server.registerTool("list_all_campaigns", { description: "List all Loops campaign pages. Read-only." }, () => call(() => loops.listAllCampaigns()));
  server.registerTool("get_campaign", { description: "Get one Loops campaign by ID. Read-only.", inputSchema: { campaignId: z.string().min(1) } }, ({ campaignId }) => call(() => loops.getCampaign(campaignId)));
  server.registerTool("get_email_message", { description: "Get one Loops email message by ID, including its current content revision. Read-only.", inputSchema: { emailMessageId: z.string().min(1) } }, ({ emailMessageId }) => call(() => loops.getEmailMessage(emailMessageId)));
  server.registerTool("list_mailing_lists", { description: "List Loops mailing lists. Read-only." }, () => call(() => loops.listMailingLists()));
  server.registerTool("list_audience_segments", { description: "List Loops audience segments. Read-only." }, () => call(() => loops.listAudienceSegments()));
  server.registerTool("get_audience_segment", { description: "Get a Loops audience segment by ID. Read-only.", inputSchema: { audienceSegmentId: z.string().min(1) } }, ({ audienceSegmentId }) => call(() => loops.getAudienceSegment(audienceSegmentId)));
  server.registerTool("find_contact", { description: "Find a Loops contact by email address or user ID. Read-only.", inputSchema: { emailOrUserId: z.string().min(1) } }, ({ emailOrUserId }) => call(() => loops.findContact(emailOrUserId)));

  server.registerTool("create_campaign_draft", { description: "Create a Loops campaign draft. Does not send or schedule.", inputSchema: { name: z.string().min(1), mailingListId: z.string().optional(), audienceSegmentId: z.string().optional(), audienceFilter: z.unknown().optional() } }, (input) => call(() => loops.createCampaign(input)));
  server.registerTool("update_campaign", { description: "Update a Loops campaign draft. Does not send or schedule.", inputSchema: { campaignId: z.string().min(1), name: z.string().optional(), mailingListId: z.string().optional(), audienceSegmentId: z.string().optional(), audienceFilter: z.unknown().optional(), scheduling: z.unknown().optional() } }, ({ campaignId, ...input }) => call(() => loops.updateCampaign(campaignId, input)));
  server.registerTool("update_email_message", { description: "Update an email message draft using an expected revision ID.", inputSchema: { emailMessageId: z.string().min(1), expectedRevisionId: z.string().min(1), subject: z.string().optional(), previewText: z.string().optional(), fromName: z.string().optional(), fromEmail: z.string().optional(), replyToEmail: z.string().optional(), emailFormat: z.string().optional(), lmx: z.string().optional(), fallbacks: z.unknown().optional() } }, ({ emailMessageId, ...input }) => call(() => loops.updateEmailMessage(emailMessageId, input)));
  server.registerTool("preview_email_message", { description: "Preview an email message for email addresses and optional contact properties.", inputSchema: { emailMessageId: z.string().min(1), emails: z.array(z.string().email()).min(1), contactProperties: z.record(z.unknown()).optional() } }, ({ emailMessageId, ...input }) => call(() => loops.previewEmailMessage(emailMessageId, input)));
  server.registerTool("upload_email_asset", { description: "Upload an email asset using base64-encoded bytes. Does not send or schedule.", inputSchema: { contentType: z.string().min(1), contentLength: z.number().int().nonnegative(), base64Data: z.string().min(1) } }, ({ contentType, contentLength, base64Data }) => call(async () => {
    const bytes = Buffer.from(base64Data, "base64");
    if (bytes.length !== contentLength) throw new Error("base64Data length does not match contentLength");
    return loops.createUpload({ contentType, contentLength }, bytes);
  }));

  server.registerTool("list_themes", { description: "List available Loops email themes." }, () => call(() => loops.listThemes()));
  server.registerTool("get_theme", { description: "Get a Loops email theme by ID.", inputSchema: { themeId: z.string().min(1) } }, ({ themeId }) => call(() => loops.getTheme(themeId)));
  server.registerTool("list_components", { description: "List available Loops email components." }, () => call(() => loops.listComponents()));
  server.registerTool("get_component", { description: "Get a Loops email component by ID.", inputSchema: { componentId: z.string().min(1) } }, ({ componentId }) => call(() => loops.getComponent(componentId)));
  server.registerTool("list_contact_properties", { description: "List Loops contact properties available for previews and audience work." }, () => call(() => loops.listContactProperties()));
  return server;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const loops = createLoopsClient({ apiKey: config.loopsApiKey, baseUrl: config.loopsBaseUrl });
  const server = createLoopsMcpServer(loops);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) await main();


// Intentionally no send or schedule tools: those operations require persisted human approval.
// Intentionally no generic raw HTTP tool.