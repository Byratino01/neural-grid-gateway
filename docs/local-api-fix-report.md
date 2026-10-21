# Report A — Local fixture API polling correction

## Finding

The local gateway in this checkout does not implement `/api/v51/jobs` or the related V51/V53 local job APIs. Unmatched requests intentionally reach the gateway's normal 404 response. The viewer has several independent job-monitor panels; outside fixture mode they poll at intervals between 1 and 3 seconds. Those production/local-engine pollers remain enabled.

The previous code already suppressed automatic poll timers when any `fixture` query parameter was present. However, a few panel refresh handlers could still issue read requests when a user opened or refreshed those panels. The exact fixture URL is now recognized as `?fixture=1`, and every read-only backend refresh handler returns before making a request in that mode.

## Change

- Added a shared fixture-mode flag in `viewer/v88.8/v70.html`.
- Guarded direct refresh handlers as well as the existing recurring timers.
- Kept non-fixture polling intervals and request paths unchanged; no production response or fixture API data was fabricated.
- Added `test/fixture-polling.test.js` for fixture and non-fixture behavior.

## Validation

- Fixture-mode Chrome smoke check: viewer loaded 3,076 meshes and 118 animations; startup and explicit refresh-button/panel-open actions issued no `/api/` requests.
- Non-fixture Chrome check: the existing polling remained active and reproduced repeated 404s from this gateway, confirming that production/local-engine polling was not disabled. This gateway has no corresponding local jobs API.
- `node --test test/fixture-polling.test.js`: 2 passed.
- Full `npm test`: 51 passed after Task A and before Phase 4 additions.
- The viewer is still expected to receive 404s from this gateway outside fixture mode because the local jobs service is not part of this server. A deployment that requires live job monitoring must provide that API separately; this change does not conceal the absence.

## Commit

`15c9898` — `Guard fixture viewer from local job polling`
