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

server.registerTool("loops_find_contact", {
  description: "Find a Loops contact by email address or user ID. Read-only.",
  inputSchema: { emailOrUserId: z.string().min(1) },
}, async ({ emailOrUserId }) => {
  try { return result(await loops.findContact(emailOrUserId)); } catch (error) { return errorResult(error); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
