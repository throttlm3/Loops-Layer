# Loops Layer

Throttl-owned integration layer for Loops REST API campaign operations, lead synchronization, approval-gated sending, webhooks, and reporting.

## Status

Foundation scaffold only. No production credentials, lead imports, or campaign sends are configured.

## Planned sources

- HubSpot
- Instantly
- Gabriel's personal lead lists

## Safety rule

Both immediate sends and scheduled sends require explicit human approval. This must be enforced by the service, not only by an agent instruction or skill.

## Planned architecture

```text
Lead sources -> normalized lead sync -> Loops REST API
                                      -> signed webhooks -> PostgreSQL reporting
                                      -> Hermes business-level tools
```

## Development

The implementation stack is not selected yet. See `docs/plan.md` for the initial scope and decisions.

Do not commit API keys, lead files, webhook secrets, or production data.
