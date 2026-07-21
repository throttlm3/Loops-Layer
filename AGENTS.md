# Loops Layer — Agent Guide

## Purpose

This repository contains Throttl's Loops REST API integration. It will synchronize leads from HubSpot, Instantly, and approved personal-list imports into Loops, manage newsletters/campaigns, ingest Loops webhooks, and expose approval-gated business operations to Hermes.

## Non-negotiable safety rules

- Never commit API keys, webhook secrets, lead files, or production payloads.
- Never send or schedule a production campaign without an explicit, persisted human approval.
- Approval must bind to the exact campaign, content revision, audience definition/snapshot, send mode, and schedule.
- The service must enforce approval independently of Hermes skills or prompts.
- Never add a generic arbitrary HTTP/API-request tool.
- Preserve source provenance and quarantine ambiguous lead matches instead of guessing.

## Source-of-truth boundaries

- HubSpot owns its source records.
- Instantly owns its source records.
- Loops owns sending, campaign execution, and provider-side audience state.
- PostgreSQL owns Throttl operational records, approvals, provenance, webhook events, and aggregated reporting.
- Obsidian holds durable plans and operating knowledge; it is not the campaign database.

## Current status

Repository is scaffolded. Implementation has not started.

## Resume protocol

1. Read this file and `docs/plan.md`.
2. Inspect the current git status and tests.
3. Confirm runtime/database decisions before creating implementation tasks.
4. Start with read-only Loops connection validation.
5. Do not use production contacts or sending credentials during the first vertical slice.

## Verification expectation

Every provider write must have a test or read-back verification, external provider IDs, correlation ID, actor, timestamp, and outcome recorded.
