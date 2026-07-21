import { describe, expect, it } from "vitest";
import {
  LoopsClient,
  buildCampaignPath,
  isRetryableLoopsError,
  normalizeCampaignStatus,
} from "../src/loops-client.js";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Loops read-only client", () => {
  it("checks the API key with a bearer request", async () => {
    let requestedUrl = "";
    let requestedHeaders: Headers | undefined;
    const client = new LoopsClient({
      apiKey: "secret",
      baseUrl: "https://loops.test/api",
      fetchFn: async (input, init) => {
        requestedUrl = String(input);
        requestedHeaders = new Headers(init?.headers);
        return response({ success: true, teamName: "Test team" });
      },
    });

    await expect(client.checkApiKey()).resolves.toEqual({ success: true, teamName: "Test team" });
    expect(requestedUrl).toBe("https://loops.test/api/v1/api-key");
    expect(requestedHeaders?.get("authorization")).toBe("Bearer secret");
  });

  it("lists campaigns with validated pagination", async () => {
    let requestedUrl = "";
    const client = new LoopsClient({
      apiKey: "secret",
      baseUrl: "https://loops.test/api",
      fetchFn: async (input) => {
        requestedUrl = String(input);
        return response({ pagination: { totalResults: 1, returnedResults: 1, nextCursor: null }, data: [] });
      },
    });

    await client.listCampaigns({ perPage: 10, cursor: "next page" });
    expect(requestedUrl).toBe("https://loops.test/api/v1/campaigns?perPage=10&cursor=next+page");
    await expect(client.listCampaigns({ perPage: 9 })).rejects.toThrow("between 10 and 50");
  });

  it("lists all campaign pages using the returned cursor", async () => {
    const requestedUrls: string[] = [];
    const client = new LoopsClient({
      apiKey: "secret",
      baseUrl: "https://loops.test/api",
      fetchFn: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (requestedUrls.length === 1) {
          return response({
            pagination: { totalResults: 2, returnedResults: 1, nextCursor: "cursor-2" },
            data: [{ id: "campaign-1", name: "One", status: "Draft" }],
          });
        }
        return response({
          pagination: { totalResults: 2, returnedResults: 1, nextCursor: null },
          data: [{ id: "campaign-2", name: "Two", status: "Sent" }],
        });
      },
    });

    await expect(client.listAllCampaigns()).resolves.toEqual([
      { id: "campaign-1", name: "One", status: "Draft" },
      { id: "campaign-2", name: "Two", status: "Sent" },
    ]);
    expect(requestedUrls).toEqual([
      "https://loops.test/api/v1/campaigns",
      "https://loops.test/api/v1/campaigns?cursor=cursor-2",
    ]);
  });

  it("surfaces structured provider errors", async () => {
    const client = new LoopsClient({
      apiKey: "secret",
      fetchFn: async () => response({ message: "bad key" }, { status: 401, headers: { "x-request-id": "req-1" } }),
    });

    await expect(client.checkApiKey()).rejects.toMatchObject({
      name: "LoopsApiError",
      status: 401,
      body: { message: "bad key" },
      requestId: "req-1",
    });
  });

  it("URL-encodes campaign IDs", async () => {
    let requestedUrl = "";
    const client = new LoopsClient({
      apiKey: "secret",
      fetchFn: async (input) => {
        requestedUrl = String(input);
        return response({ id: "a/b", name: "Test", status: "Draft" });
      },
    });

    await client.getCampaign("a/b");
    expect(requestedUrl).toContain("/v1/campaigns/a%2Fb");
    expect(buildCampaignPath("a/b")).toBe("/v1/campaigns/a%2Fb");
  });

  it("normalizes known campaign statuses", () => {
    expect(normalizeCampaignStatus("Draft")).toBe("draft");
    expect(normalizeCampaignStatus("Sent")).toBe("sent");
    expect(normalizeCampaignStatus("other")).toBe("unknown");
  });

  it("marks rate limits and server errors retryable", () => {
    expect(isRetryableLoopsError({ status: 429 })).toBe(true);
    expect(isRetryableLoopsError({ status: 503 })).toBe(true);
    expect(isRetryableLoopsError({ status: 400 })).toBe(false);
  });
});
