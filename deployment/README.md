# Cloudflare presentation

This isolated Worker uses account `755fbf7d35e9e2b67cb381f2bedf6509` and creates `manasik-utn-prototype` plus its `PrototypeState` Durable Object namespace and three thin service-binding entry Workers. It does not modify existing Manasik applications.

OTA: https://utn-otn.halavalet.workers.dev

UTN: https://utn-testenvironment.halavalet.workers.dev/utn/

API: https://utn-api.halavalet.workers.dev/v1

All entry Workers share one core and the same persisted state. No custom domains were registered because the authorized account has no owned DNS zones.

`node scripts/cloudflare-build.mjs` builds OTA and Expo web into `dist/`. The Expo base path is `/utn`. `scripts/cloudflare-deploy.ps1` builds, deploys, and installs secrets. Wrangler must be installed or available through `npx` and authenticated to the account above.

Secrets are loaded by deployment from ignored `.data/cloudflare-secrets.json`:

- `DEMO_PASSWORD`: private presentation access code.
- `SERVICE_SECRET`: signs service callbacks and certificates.
- `SANDBOX_PARTNER_API_KEY`: server-to-server sandbox key, generated with a `utn_test_` prefix. Send it as `x-api-key`; never put it in a mobile or browser bundle.
- `PARTNER_CALLBACK_SECRET`: separate external callback signing key. Share this only with the registered callback receiver; never share the internal `SERVICE_SECRET`.
- `OPENAI_API_KEY`: optional; add it to enable real image assessment. No OpenAI credential was found in the authorized source project during setup.

Never commit this file or embed these values in frontend builds. The presentation gate fails closed when required secrets are absent. Successful entry issues an HttpOnly, Secure, SameSite=Lax cookie valid for 24 hours. A prototype access code is shared presentation access, not an individual-user authorization system. The UTN static shell is public so invited pilgrims can open their link. UTN invitation endpoints are accessible to native apps without the presentation cookie; each request is scoped by a high-entropy, expiring invitation token. Possession of this token grants access to that pilgrim's invitation, so invitation URLs must be treated as sensitive.

## External sandbox API

Base: `https://utn-api.halavalet.workers.dev/v1`

- `POST /verification-requests` accepts the direct guide-aligned root `{groupInfo, package, mutamers, additionalInformation?}`.
- `GET /verification-requests/:id` reads the submitted request's status.
- Both require `x-api-key: <SANDBOX_PARTNER_API_KEY>` and bypass the presentation cookie. Integrate from the partner backend, not from public frontend code.
- Optional `PARTNER_CALLBACK_URL` registers a fixed server callback destination. Caller-supplied callback URLs must match the backend's configured destination. Configure this separately per partner before sharing an external key.
- Verify callback `x-utn-signature` using HMAC-SHA256 over `x-utn-timestamp + '.' + rawRequestBody` with `PARTNER_CALLBACK_SECRET`, and reject stale timestamps/replayed event IDs.

Native base URL is `https://utn-api.halavalet.workers.dev`, and the application appends `/api/invitations/:token`. Invitation reads, corrections, verification and certificate retrieval use this scoped path. No unrestricted booking creation or service invitation creation is exposed outside the presentation gate.

The Worker serves both frontends and routes OTA requests at `/api/*` and UTN requests at `/api/utn/api/*`. Separate Durable Object instances (`ota` and `utn`) communicate through binding fetch calls, preserving API JSON contracts and signed callbacks. Each object's state persists in SQLite. Failed callbacks retry using alarms. Document image bytes are passed to the configured assessment service without persisting uploads in application state.

`node scripts/cloudflare-smoke.mjs` validates the deployed gate, both APIs, synthetic invitation, simulated verification, signed callback, booking status and certificate. `--local` targets the disposable local Wrangler server on port 8787. This creates synthetic demonstration records; it sends no email or SMS and does not call OpenAI.

Demo assessments and certificates are explicitly simulated. AI assessment indicates visible document consistency, not issuer authentication, official visa eligibility, or government certification.

Technical references: [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) and [SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
