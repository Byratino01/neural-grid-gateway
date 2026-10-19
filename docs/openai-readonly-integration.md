# OpenAI API read-only connector

The existing ChatGPT station now reports an **OpenAI API** connector. It does not represent access to the consumer ChatGPT application, conversations, subscription plan, or account activity.

## Provider source and permission

The connector uses only `GET https://api.openai.com/v1/organization/usage/completions`, with `bucket_width=1d`, the current UTC day range, and `group_by=model`. This supported organization Usage endpoint returns provider-reported bucket counts such as model request count, input tokens, output tokens, cached input tokens, and a model identifier when available. The snapshot also records the gateway's elapsed verification time for the read itself; that is not model inference latency.

Configure an optional server-side `OPENAI_ADMIN_KEY` only after separate approval. It must be an Admin API credential scoped to **Organization Usage: Read**. No model request permission, general `OPENAI_API_KEY`, inference call, or browser credential is required. This repository change does not configure or store a credential. Without the key, the endpoint reports `unconnected` and makes no OpenAI request. A successful HTTP read is required before the existing connector row reports `connected`.

The gateway route `GET /api/openai/telemetry` requires the existing short-lived viewer session, applies its existing origin checks, and returns only a sanitized usage snapshot. No OpenAI credential is returned or logged. The route issues no write requests. The viewer invokes it only after the operator presses Connect; disconnect and session reset clear the displayed snapshot. Existing 900-second viewer-session expiry remains unchanged.

## Dashboard and interaction behavior

- Connector row: `OpenAI API`, with connected state only after a successful authorized usage read.
- Activity Feed: a separately labelled provider usage snapshot, clearly marked as a daily aggregate rather than a live event.
- Station Metrics: the OpenAI row remains distinct from GitHub event counts; usage is labelled as a provider aggregate.
- Event Flow: continues to plot verified GitHub events only. Aggregated OpenAI usage is not plotted as an event.
- Connection Map: reports whether the read-only API check was verified and explicitly states that no ChatGPT account feed is available. It adds no application-to-application route.
- Orbital animation: the connector does not emit monitor events, pulse the station, or activate red signals. A provider usage read does not prove an OpenAI-to-GitHub interaction.

## Data limits

The provider source is the organization completions usage endpoint, not the user's ChatGPT account. Its current UTC-day bucket can be partial or delayed. It does not provide per-request inference latency or per-request error status through this integration. This gateway does not observe requests made by other clients. An empty result is shown as an empty provider bucket, not fabricated zero activity. ChatGPT consumer conversations, subscription usage, and product events remain unavailable here.

## Verification

`test/openai-connector.test.js` uses mocked provider responses and verifies GET-only access, endpoint and query scope, grouped models/tokens/counts, sanitized failures, secret exclusion, and browser snapshot validation. `test/gateway-security.test.js` covers authenticated viewer reads, absent credentials, the lack of a write route, and the existing inference-deny route. Existing regression tests continue to cover GitHub behavior, the six panels, gateway sessions, and the approved GLB. Live provider verification remains unperformed until an approved least-privilege credential is supplied.

## Official OpenAI documentation

- [Organization completions usage endpoint](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions) — GET request, current time range, daily buckets, and model grouping.
- [OpenAI RBAC permissions](https://developers.openai.com/api/docs/guides/rbac) — Usage has a Read permission; model-request capabilities are separate.
- [OpenAI API overview](https://developers.openai.com/api/reference/overview) — Admin API keys are for Administration endpoints; credentials are bearer secrets and must remain server-side.
