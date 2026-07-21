# Loops Layer

Thin MCP wrapper over the Loops REST API. This repository exists so Hermes can operate the Loops account directly through conversation without manually constructing HTTP requests.

## What it provides

The stdio MCP server currently exposes read-only tools for:

- validating the Loops API key
- listing campaigns and campaign pages
- getting a campaign
- getting an email message and content revision
- listing mailing lists
- listing audience segments
- finding a contact

The API key is read from `LOOPS_API_KEY` and is never returned by a tool.

## Local setup

```bash
npm install
cp .env.example .env
# set LOOPS_API_KEY in the environment or your secret manager
npm run typecheck
npm test
npm run build
```

Run the server:

```bash
LOOPS_API_KEY=... npm start
```

The server uses MCP stdio transport. Hermes configuration will point at `dist/server.js` and pass `LOOPS_API_KEY` through the MCP server `env` block.

## Current tool scope

The first slice is intentionally read-only. Draft editing, previews, contact writes, and send/schedule operations will be added as separate tools. Immediate send and scheduled send will require explicit human approval in the tool contract and server-side guard before any Loops write.

There is deliberately no generic raw HTTP tool.

## Security

Do not commit `.env`, API keys, contact exports, or production payloads. Review tool descriptions and output before enabling mutation tools.

## Verification

The repository currently passes:

```bash
npm test
npm run typecheck
npm run build
```

No live Loops credentials or external writes are required for the test suite.
