# Loops Layer — Initial Build Plan

## Confirmed direction

- Separate repository under the `throttlm3` GitHub account.
- Loops REST API is the production integration surface.
- Lead sources are HubSpot, Instantly, and Gabriel's personal lead lists.
- Support both immediate and scheduled sends.
- Both send modes require explicit human approval.

## First vertical slice

```text
Validate Loops key
→ import one test CSV
→ upsert contacts with provenance
→ create one campaign draft
→ write/read LMX with revision ID
→ send preview
→ request explicit approval
→ schedule or immediately send one controlled test
→ read campaign status
```

## Phases

1. Foundation: typed HTTP client, configuration, errors, retries, CI.
2. Lead normalization: HubSpot/Instantly/personal-list adapters and idempotent Loops sync.
3. Campaign service: drafts, audiences, LMX, assets, previews, schedule/send, read-back.
4. Approval service and Hermes operational skill.
5. Signed webhook ingestion and PostgreSQL reporting.
6. Narrow Hermes/MCP business-level tool surface.

## Open decisions

- Runtime language/framework.
- PostgreSQL location/schema and connection ownership.
- Initial personal-list import format; CSV is the proposed default.
- Whether preview/test sends require approval or only production sends.
- First controlled test audience.
