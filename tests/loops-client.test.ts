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

  it("creates and updates draft campaigns with typed payloads", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const client = new LoopsClient({ apiKey: "secret", baseUrl: "https://loops.test/api", fetchFn: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return response({ id: "campaign-1", emailMessageId: "message-1", emailMessageContentRevisionId: "rev-1" });
    }});
    await client.createCampaign({ name: "Draft", mailingListId: "list-1" });
    await client.updateCampaign("campaign-1", { name: "Renamed", audienceSegmentId: "segment-1" });
    expect(requests).toEqual([
      { url: "https://loops.test/api/v1/campaigns", method: "POST", body: { name: "Draft", mailingListId: "list-1" } },
      { url: "https://loops.test/api/v1/campaigns/campaign-1", method: "POST", body: { name: "Renamed", audienceSegmentId: "segment-1" } },
    ]);
  });

  it("updates and previews an email message", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const client = new LoopsClient({ apiKey: "secret", baseUrl: "https://loops.test/api", fetchFn: async (input, init) => {
      requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined }); return response({ ok: true });
    }});
    await client.updateEmailMessage("message-1", { expectedRevisionId: "rev-1", subject: "Hello", emailFormat: "html" });
    await client.previewEmailMessage("message-1", { emails: ["preview@example.com"], contactProperties: { firstName: "Ada" } });
    expect(requests).toEqual([
      { url: "https://loops.test/api/v1/email-messages/message-1", body: { expectedRevisionId: "rev-1", subject: "Hello", emailFormat: "html" } },
      { url: "https://loops.test/api/v1/email-messages/message-1/preview", body: { emails: ["preview@example.com"], contactProperties: { firstName: "Ada" } } },
    ]);
  });

  it("uploads bytes to the presigned URL and completes the upload", async () => {
    const requests: Array<{ url: string; method: string; body: unknown; headers: Headers }> = [];
    const client = new LoopsClient({ apiKey: "secret", baseUrl: "https://loops.test/api", fetchFn: async (input, init) => {
      const url = String(input); requests.push({ url, method: init?.method ?? "GET", body: init?.body, headers: new Headers(init?.headers) });
      if (url.endsWith("/v1/uploads")) return response({ emailAssetId: "asset-1", presignedUrl: "https://upload.test/asset" });
      return response({ finalUrl: "https://cdn.test/asset" });
    }});
    await expect(client.createUpload({ contentType: "image/png", contentLength: 3 }, new Uint8Array([1, 2, 3]))).resolves.toEqual({ finalUrl: "https://cdn.test/asset" });
    expect(requests[0]).toMatchObject({ url: "https://loops.test/api/v1/uploads", method: "POST" });
    expect(requests[1]).toMatchObject({ url: "https://upload.test/asset", method: "PUT" });
    expect(requests[1].headers.get("content-type")).toBe("image/png");
    expect(requests[1].headers.get("content-type")).toBe("image/png");
    expect(requests[1].body).toBeInstanceOf(Uint8Array);
    expect(Array.from(requests[1].body as Uint8Array)).toEqual([1, 2, 3]);
    expect(requests[2]).toMatchObject({ url: "https://loops.test/api/v1/uploads/asset-1/complete", method: "POST" });
  });

  it("uses official content and audience paths", async () => {
    const urls: string[] = [];
    const client = new LoopsClient({ apiKey: "secret", baseUrl: "https://loops.test/api", fetchFn: async (input) => { urls.push(String(input)); return response({ data: [] }); } });
    await client.listThemes(); await client.getTheme("theme-1"); await client.listComponents(); await client.getComponent("component-1");
    await client.listMailingLists(); await client.listAudienceSegments(); await client.getAudienceSegment("segment-1"); await client.listContactProperties();
    expect(urls).toEqual([
      "https://loops.test/api/v1/themes", "https://loops.test/api/v1/themes/theme-1", "https://loops.test/api/v1/components", "https://loops.test/api/v1/components/component-1",
      "https://loops.test/api/v1/lists", "https://loops.test/api/v1/audience-segments", "https://loops.test/api/v1/audience-segments/segment-1", "https://loops.test/api/v1/contact-properties",
    ]);
  });
});
