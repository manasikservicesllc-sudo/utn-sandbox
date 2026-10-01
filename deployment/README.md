# Cloudflare public staging

This isolated Worker uses account `755fbf7d35e9e2b67cb381f2bedf6509` and creates `manasik-utn-prototype` plus its `PrototypeState` Durable Object namespace and three thin service-binding entry Workers. It does not modify existing Manasik applications.

OTA: https://ota.utn-staging.com

UTN: https://utn-staging.com/utn/

API: https://api.utn-staging.com/v1

Integration guide: https://utn-staging.com/integration-guide

The deployed PUBLIC_SANDBOX=true mode makes both apps and partner intake/status publicly accessible. No presentation password, cookie, account, or API key is required. CORS accepts any browser origin. Use synthetic test data in this public sandbox.

All entry Workers share one core and the same persisted state. The custom domains use the authorized active utn-staging.com zone; the original workers.dev aliases remain available.

`node scripts/cloudflare-build.mjs` builds OTA and Expo web into `dist/`. The Expo base path is `/utn`. `scripts/cloudflare-deploy.ps1` builds, deploys, and installs secrets. Wrangler must be installed or available through `npx` and authenticated to the account above.

Secrets are loaded by deployment from ignored `.data/cloudflare-secrets.json`:

- `DEMO_PASSWORD`: optional private-mode presentation code; unused in public staging.
- `SERVICE_SECRET`: signs service callbacks and certificates.
- `SANDBOX_PARTNER_API_KEY`: optional private-mode partner key; not required in public staging.
- `PARTNER_CALLBACK_SECRET`: separate external callback signing key. Share this only with the registered callback receiver; never share the internal `SERVICE_SECRET`.
- `OPENAI_API_KEY`: optional; add it to enable real image assessment. No OpenAI credential was found in the authorized source project during setup.

Never commit the secrets file or embed its values in frontend bundles. Internal service authorization, signed callbacks, booking access tokens, and scoped expiring invitation tokens remain enforced. Public access does not disable these internal controls.

## External sandbox API

Base: `https://api.utn-staging.com/v1`

- `POST /verification-requests` accepts the direct guide-aligned root `{groupInfo, package, mutamers, additionalInformation?}`.
- `GET /verification-requests/:id` reads the submitted request's status.
- Both are public in the deployed staging mode: no API key or login. Call from a browser, Postman, cURL, or any backend.
- Optional `PARTNER_CALLBACK_URL` registers a fixed server callback destination. Caller-supplied callback URLs must match the backend's configured destination. Configure this separately per partner before sharing an external key.
- Verify callback `x-utn-signature` using HMAC-SHA256 over `x-utn-timestamp + '.' + rawRequestBody` with `PARTNER_CALLBACK_SECRET`, and reject stale timestamps/replayed event IDs.

Native base URL is `https://api.utn-staging.com`, and the application appends `/api/invitations/:token`. Invitation reads, corrections, verification and certificate retrieval use this scoped path. OTA demo booking creation is public; internal service invitation creation and callbacks remain authenticated.

The Worker serves both frontends and routes OTA requests at `/api/*` and UTN requests at `/api/utn/api/*`. Separate Durable Object instances (`ota` and `utn`) communicate through binding fetch calls, preserving API JSON contracts and signed callbacks. Each object's state persists in SQLite. Failed callbacks retry using alarms. Document image bytes are passed to the configured assessment service without persisting uploads in application state.

`node scripts/cloudflare-smoke.mjs` validates open staging access, arbitrary-origin CORS, the integration guide, both APIs, synthetic invitation, simulated verification, signed callback, booking status and certificate. `--local` targets the disposable local Wrangler server on port 8787. This creates synthetic demonstration records; it sends no email or SMS and does not call OpenAI.

Demo assessments and certificates are explicitly simulated. AI assessment indicates visible document consistency, not issuer authentication, official visa eligibility, or government certification.

Technical references: [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) and [SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
