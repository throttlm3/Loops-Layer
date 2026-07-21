import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createLoopsClient } from "./loops-client.js";

const config = loadConfig();
const loops = createLoopsClient({ apiKey: config.loopsApiKey, baseUrl: config.loopsBaseUrl });
const server = new McpServer({ name: "throttl-loops", version: "0.1.0" });

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

server.registerTool("loops_check_connection", {
  description: "Validate the configured Loops API key and return team context. Read-only.",
}, async () => {
  try { return result(await loops.checkApiKey()); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_list_campaigns", {
  description: "List Loops campaigns. Read-only.",
  inputSchema: { perPage: z.number().int().min(10).max(50).optional(), cursor: z.string().optional() },
}, async ({ perPage, cursor }) => {
  try { return result(await loops.listCampaigns({ perPage, cursor })); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_list_all_campaigns", {
  description: "List all Loops campaign pages. Read-only.",
}, async () => {
  try { return result(await loops.listAllCampaigns()); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_get_campaign", {
  description: "Get one Loops campaign by ID. Read-only.",
  inputSchema: { campaignId: z.string().min(1) },
}, async ({ campaignId }) => {
  try { return result(await loops.getCampaign(campaignId)); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_get_email_message", {
  description: "Get one Loops email message by ID, including its current content revision. Read-only.",
  inputSchema: { emailMessageId: z.string().min(1) },
}, async ({ emailMessageId }) => {
  try { return result(await loops.getEmailMessage(emailMessageId)); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_list_mailing_lists", {
  description: "List Loops mailing lists. Read-only.",
}, async () => {
  try { return result(await loops.listMailingLists()); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_list_audience_segments", {
  description: "List Loops audience segments. Read-only.",
}, async () => {
  try { return result(await loops.listAudienceSegments()); } catch (error) { return errorResult(error); }
});

server.registerTool("loops_create_campaign_draft", { description: "Create a Loops campaign draft. Does not send or schedule.", inputSchema: { name: z.string().min(1), mailingListId: z.string().optional(), audienceSegmentId: z.string().optional(), audienceFilter: z.unknown().optional() } }, async (input) => { try { return result(await loops.createCampaign(input)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_upload_email_asset", { description: "Upload an email asset to Loops using base64-encoded bytes. Does not send or schedule.", inputSchema: { contentType: z.string().min(1), contentLength: z.number().int().nonnegative(), base64Data: z.string().min(1) } }, async ({ contentType, contentLength, base64Data }) => {
  try {
    const bytes = Buffer.from(base64Data, "base64");
    if (bytes.length !== contentLength) return errorResult(new Error("base64Data length does not match contentLength"));
    return result(await loops.createUpload({ contentType, contentLength }, bytes));
  } catch (error) { return errorResult(error); }
});
server.registerTool("loops_update_campaign", { description: "Update a Loops campaign draft. Does not send or schedule.", inputSchema: { campaignId: z.string().min(1), name: z.string().optional(), mailingListId: z.string().optional(), audienceSegmentId: z.string().optional(), audienceFilter: z.unknown().optional(), scheduling: z.unknown().optional() } }, async ({ campaignId, ...input }) => { try { return result(await loops.updateCampaign(campaignId, input)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_update_email_message", { description: "Update an email message draft using an expected revision ID.", inputSchema: { emailMessageId: z.string().min(1), expectedRevisionId: z.string().min(1), subject: z.string().optional(), previewText: z.string().optional(), fromName: z.string().optional(), fromEmail: z.string().optional(), replyToEmail: z.string().optional(), emailFormat: z.string().optional(), lmx: z.string().optional(), fallbacks: z.unknown().optional() } }, async ({ emailMessageId, ...input }) => { try { return result(await loops.updateEmailMessage(emailMessageId, input)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_preview_email_message", { description: "Preview an email message for email addresses and optional contact properties.", inputSchema: { emailMessageId: z.string().min(1), emails: z.array(z.string().email()).min(1), contactProperties: z.record(z.unknown()).optional() } }, async ({ emailMessageId, ...input }) => { try { return result(await loops.previewEmailMessage(emailMessageId, input)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_list_themes", { description: "List available Loops email themes.", inputSchema: {} }, async () => { try { return result(await loops.listThemes()); } catch (error) { return errorResult(error); } });
server.registerTool("loops_get_theme", { description: "Get a Loops email theme by ID.", inputSchema: { themeId: z.string().min(1) } }, async ({ themeId }) => { try { return result(await loops.getTheme(themeId)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_list_components", { description: "List available Loops email components.", inputSchema: {} }, async () => { try { return result(await loops.listComponents()); } catch (error) { return errorResult(error); } });
server.registerTool("loops_get_component", { description: "Get a Loops email component by ID.", inputSchema: { componentId: z.string().min(1) } }, async ({ componentId }) => { try { return result(await loops.getComponent(componentId)); } catch (error) { return errorResult(error); } });
server.registerTool("loops_list_contact_properties", { description: "List Loops contact properties available for previews and audience work.", inputSchema: {} }, async () => { try { return result(await loops.listContactProperties()); } catch (error) { return errorResult(error); } });
server.registerTool("loops_get_audience_segment", { description: "Get a Loops audience segment by ID.", inputSchema: { audienceSegmentId: z.string().min(1) } }, async ({ audienceSegmentId }) => { try { return result(await loops.getAudienceSegment(audienceSegmentId)); } catch (error) { return errorResult(error); } });

server.registerTool("loops_find_contact", {
  description: "Find a Loops contact by email address or user ID. Read-only.",
  inputSchema: { emailOrUserId: z.string().min(1) },
}, async ({ emailOrUserId }) => {
  try { return result(await loops.findContact(emailOrUserId)); } catch (error) { return errorResult(error); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
