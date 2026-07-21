import { describe, expect, it } from "vitest";
import { createLoopsMcpServer, formatToolError } from "../src/server.js";

function tool(server: unknown, name: string): { handler: (input: unknown) => Promise<unknown> } {
  const registered = (server as { _registeredTools: Record<string, { handler: (input: unknown) => Promise<unknown> }> })._registeredTools;
  return registered[name];
}

describe("Loops MCP server", () => {
  it("registers concise business-named tools and excludes send/schedule", () => {
    const calls: string[] = [];
    const loops = new Proxy({}, { get: (_target, property) => async (..._args: unknown[]) => { calls.push(String(property)); return { property }; } });
    const server = createLoopsMcpServer(loops as never);
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(Object.keys(registered)).toEqual(expect.arrayContaining([
      "check_connection", "list_campaigns", "list_all_campaigns", "get_campaign", "get_email_message",
      "list_mailing_lists", "list_audience_segments", "get_audience_segment", "find_contact",
      "create_campaign_draft", "update_campaign", "update_email_message", "preview_email_message", "upload_email_asset",
      "list_themes", "get_theme", "list_components", "get_component", "list_contact_properties",
    ]));
    expect(Object.keys(registered).some((name) => name.startsWith("loops_") || name === "send" || name === "schedule")).toBe(false);
  });

  it("delegates a draft operation to the injected client", async () => {
    const loops = { createCampaign: async (input: unknown) => ({ input }) };
    const server = createLoopsMcpServer(loops as never);
    await expect(tool(server, "create_campaign_draft").handler({ name: "Draft" })).resolves.toMatchObject({
      content: [{ type: "text", text: JSON.stringify({ input: { name: "Draft" } }, null, 2) }],
    });
  });

  it("returns stable safe structured errors without leaking provider bodies or secrets", () => {
    const error = Object.assign(new Error("provider said token=secret-value"), {
      status: 401,
      requestId: "req-123",
      body: { token: "secret-value", message: "private details" },
    });
    expect(formatToolError(error)).toEqual({
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({ error: { code: "LOOPS_API_ERROR", message: "Loops API request failed", status: 401, retryable: false, requestId: "req-123" } }, null, 2),
      }],
    });
  });
});