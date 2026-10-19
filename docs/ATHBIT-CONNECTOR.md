# Manasik integration with Athbit

Prepared against the production team's Arabic integration guide dated 13 October 2026 and updated against Athbit_Partner_SOP.pdf dated 18 October 2026 (pages 16–18). Deployed and enabled for new OTA test bookings on 19 October 2026. Existing bookings retain their original provider. Credentials are Cloudflare secrets, not repository files.

## Current external test result — 19 October 2026

- Worker version: `5807a627-ce85-4ffd-924b-4a0e94b577b0`.
- `ATHBIT_API_KEY` and `ATHBIT_WEBHOOK_SECRET` installed. Sandbox only.
- POST through OTA with reference `MANASIK-ATHBIT-TEST-20261019-01` reached Athbit but received HTTP 500. A separate direct diagnostic request `MANASIK-ATHBIT-DIAGNOSTIC-20261019-01` received the same HTTP 500 with provider error `تعذّر إنشاء سجل المعتمر.` No successful request ID was returned; dashboard creation and webhook delivery remain unconfirmed.
- Both requests used synthetic `DEMO MANASIK` data, not real traveler data. The first OTA attempt also exposed a Workers redirect-mode incompatibility, fixed by using `manual` so redirects are not followed with credentials.
- Production team should inspect the failed intake and pilgrim-record validation using these references. Once fixed, rerun `node scripts/test-athbit-staging.mjs` to retry the OTA booking with its existing idempotency key.

## Provisioning needed from the production team

- The SOP now supplies `ATHBIT_BASE_URL=https://athbitsa.com/hcgi/platform`. The create endpoint is `https://athbitsa.com/hcgi/platform/v1/verification-requests`. The adapter also accepts the earlier origin-only configuration.
- A Manasik institution `athbit_test_` API key, stored as a Cloudflare secret named `ATHBIT_API_KEY`.
- The webhook signing secret, stored as `ATHBIT_WEBHOOK_SECRET`.
- Registered callback supplied to the user: `https://ota.utn-staging.com/api/webhooks/athbit`. The endpoint is now deployed; provider Send Test delivery still needs confirmation.
- Allow `ota.utn-staging.com` as a return domain and use `https://ota.utn-staging.com/api/athbit/return` as the return URL.

Do not put either secret in the repository, frontend variables, or this document. This staging connector accepts test keys only. Enabling live traffic requires a separate rollout.

## Configuration and activation

Set `ATHBIT_BASE_URL` and `ATHBIT_RETURN_URL` as server configuration, install the two secrets, deploy the prepared changes, and set `ATHBIT_ENABLED=true` only after agreeing the test window. Until then the default is false. The selected provider is stored per booking, so retries of existing local sandbox bookings remain local.

## Implemented flow

1. Manasik sends the existing direct ministry-shaped `groupInfo`, `package`, and `mutamers` body, with the configured `return_url`. The legacy `grandFatherNameEn` field is mapped to the guide's `grandfatherNameEn`. No country or gender values are guessed.
2. The booking ID is the outbound idempotency key. The remote `id`, rather than the echoed client `requestId`, is stored for webhook matching. The adapter also exposes a GET method for later reconciliation; there is no periodic remote polling.
3. Each returned HTTPS `webUrl` is displayed for its corresponding traveler. Unexpected or missing traveler mappings fail the submission.
4. Webhooks validate HMAC over the exact raw body, millisecond timestamp freshness, matching header/body event IDs, request and invitation mapping. Event IDs are persisted for deduplication. Decisions require an increasing revision. A callback arriving before the intake response receives 503 so the provider can retry.
5. Workflow messages are rendered as text in the booking. An unsigned return or workflow-only `result` never approves a traveler. Signed decision events update the result; certificate revocations can clear a previous certificate. Test results are explicitly marked simulated.
6. Signed returns validate the second-based timestamp and HMAC server-side and redirect to the OTA home page. The returning browser's saved booking access restores its confirmation view. A different browser without that saved access must reopen its booking; the signed return intentionally does not expose booking access tokens.

## 18 October SOP updates

- Requests explicitly set `return_mode=after_submit`. The signed `result=submitted` return is accepted but never changes the verification outcome. `case_submitted` is a workflow event; the decision arrives later.
- The optional `groupUrl` is validated, persisted, and shown on the booking so multiple pilgrims can complete the journey together. Individual `webUrl` links remain available.
- The SOP also offers `handoffUrl`, a one-use 15-minute link that bypasses identity confirmation, and `POST /v1/verification-requests/{id}/handoff` to renew it. Automatic handoff and renewal are **not enabled** in this public demo: its demo sign-in does not establish the authenticated customer identity assumed by that flow. The adapter validates returned handoff URLs but does not expose them in the booking UI. Use the individual identity-confirmation path until that prerequisite is implemented.
- Sandbox suppresses invitation emails; Live sends them. No live key is accepted by this connector.
- The two supplied Claude artifact pages could not be retrieved with the web reader; the PDF is the source for these updates.

## Joint acceptance test before enabling

Send `test.ping`, submit a two-traveler dummy request, replay the same intake idempotency key, complete the external invitation, request an additional document, and receive a signed final result. Verify duplicate and out-of-order deliveries, revocation/reissue, and the signed return. Confirm actual event shapes, certificate/verifyUrl placement, image handling and URL behavior with the team. Local fixtures cannot establish these service behaviors.

Local validation includes existing regression tests plus `tests/athbit.test.mjs`; the OTA production build passes. No real traveler data has been sent to Athbit during preparation.
