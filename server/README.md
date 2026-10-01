# OTA ↔ UTN prototype services

Run `node server/start.mjs` from the repository root. Node 22 is supported; no server packages are required. Both services listen on loopback: OTA 4100, UTN 4101. Copy `.env.example` to `.env` for optional AI settings. Never add an OpenAI key to browser or Expo configuration.

The primary partner intake is **`POST UTN /api/v1/verification-requests`**, authenticated with `X-API-Key: <SANDBOX_PARTNER_API_KEY>`. Send the direct guide-shaped body `{groupInfo,package,mutamers,additionalInformation?}` without a `visaRequest` wrapper. `GET UTN /api/v1/verification-requests/:id` with the same key returns current invitations, verification results, certificates, notification previews and callback delivery status. The OTA demonstration calls this actual partner intake. Keys are server-only and this sandbox represents one registered demo tenant.

Optional `additionalInformation.notificationMode: "demo"` creates explicitly `simulated` SMS/WhatsApp welcome records; otherwise records are `not_configured`. Neither status means sent, and `sentAt` remains null. `additionalInformation.callbackUrl`, if provided, must exactly match server-configured `PARTNER_CALLBACK_URL`; arbitrary callback destinations are rejected. Without a registered callback, results remain available through authenticated status polling.

External callback headers are `x-utn-timestamp` (epoch milliseconds) and `x-utn-signature` (hex HMAC-SHA256 of `timestamp + "." + rawBody`, signed with separate `PARTNER_CALLBACK_SECRET`). Body: `{eventId,requestId,bookingId,invitationId,otaMutamerId,verification}`. Verify using the exact received bytes and a timing-safe comparison, reject timestamps outside five minutes, deduplicate `eventId`, and only apply a newer `verification.revision`. Return any HTTP 2xx response to acknowledge. Failed callbacks remain queued for retry; signing timestamps refresh per attempt.

`PATCH UTN /api/invitations/:token` accepts `{applicant:{...corrections}}` for English/Arabic name components, email/mobile, passport number/expiry and iqama number/expiry. It logs an audit entry, immediately invalidates the certificate, increments the revision and emits a `pending` callback. Verification must be repeated using corrected data. AI calls are limited per invitation to five attempts in 24 hours and at least 30 seconds apart.

- `POST OTA /api/bookings`: `{visaRequest:{groupInfo,package,mutamers},otaExtras,serviceId}`. `serviceId:utn` creates invitations; `serviceId:essential` returns `status:not_required` and no UTN transfer. Use a random `Idempotency-Key` header for retriable submissions. Reusing the same key and payload returns the same booking; changing the payload returns 409. Original visa payload is preserved as supplied; this is not a production validation of every guide field or government lookup ID.
- `GET OTA /api/bookings/:id`: `Authorization: Bearer <accessToken>` returned by creation.
- `GET UTN /api/invitations/:token`: one pilgrim's record, booking package and capabilities.
- `POST UTN /api/invitations/:token/verify`: `{category,documentType,mode,scenario,document,consent}`. `mode` is `demo` or `ai`; demo scenarios are `verified`, `review`, `rejected`. An omitted document in demo explicitly runs a simulated fixture. AI requires `consent:true` plus `{name,mimeType,base64}` image, maximum 5 MB. PNG/JPEG/WebP signatures are checked.
- `GET UTN /api/invitations/:token/certificate`: signed JSON certificate when verified.
- `GET /api/health` on each service; UTN returns `aiAvailable`.

Category/document mapping: `gcc_citizen` accepts `national_id` or `passport`; `gcc_resident`, `schengen_resident`, `us_resident` accept `residence_permit`; `schengen_visa`, `us_visa` accept `visa`. These are demonstration product routes, not immigration eligibility rules.

UTN posts an actual HMAC authenticated HTTP callback to OTA. Five minute timestamp validation, event deduplication, and per-invitation revisions prevent replay and stale retry overwrites. A persisted outbox retries delivery every ten seconds. This local demo keeps JSON records under `data/`; uploaded image bytes are not persisted. Invitation tokens expire after seven days. The API key and service signing secret remain server-side.

AI uses the OpenAI Responses API image input and structured output to assess readability, name, type, issuer consistency and expiry. A `verified` AI result means visual consistency only; neither issuer authenticity nor visa eligibility is established. Uncertainty routes to `needs_review`, with no certificate. Demo certificates visibly retain `mode:demo`, `simulated:true` and a simulation scope. A missing key or provider failure never silently produces a demo verification.

The demo has no real email/SMS delivery, payment, issuer checks, reviewer console, government submission, production authentication or encrypted database. Invitation links are bearer capabilities. Use synthetic sample records for demonstrations. Configure public origins and HTTPS before remote use, and integrate authentication, secure storage, retention controls and an approved review workflow before real document processing.

Cloudflare adapters can use `createRuntime(options)` from `services.mjs`, supplying `store`, `post`, `dataDir`, `secret`, `apiKey`, `model`, `origins`, `utnWebUrl`. It returns Node-shaped request handlers, `setUrls` and `retryCallbacks`. Adapter storage must persist mutations after each handler; its timer/alarm must call retries.

Validate: `node --test tests/api.test.mjs`.

## Integration guide mapping

The prototype envelope preserves the request groups described in OTA B2C Integration Guide v1.4.6 section 5.16, pages 27–36: `groupInfo` (OTA/request/group and operator references), `package` (arrival/departure routes, ground services, housing and other package services), and `mutamers` (individual names, passport, birth, nationality/residence, contact, education/profession, images, iqama and disclosure answers). The OTA form maps names directly, converts entered dates to ISO timestamps and numeric form values to numbers. Each `otaMutamerId` links exactly one UTN invitation and callback result to its original traveler.

`otaExtras` carries UI context separately: package label, departure city/date, consent and demonstration lookup notes. Root `serviceId` selects the UTN handoff without altering the preserved ministry-shaped body. Results are returned outside that body in `verifications`, and each public invitation is enriched with `status`, `applicantName` and `certificate` for OTA rendering.

Country values in this prototype are demo ISO numeric codes, not verified ministry lookup IDs. Empty passport/personal image fields and disclosure arrays are allowed because official lookup questions and upload endpoints are not connected. No disclosure answers, ministry IDs or visa submission are fabricated. The only enforced intake requirements here are the envelope, 1–10 applicants, unique traveler references and English first/family names. Full ministry contract validation belongs to a future authenticated integration against official lookups.
