# Manasik × UTN — connected Umrah sandbox

A working OTA simulator, an Expo React Native UTN app (iOS + web), and a partner-facing UTN API. Built for an executive demonstration with synthetic data, with an explicit separation between simulated assessment and OpenAI vision assessment.

## Start locally

Requires Node 22 or newer.

```sh
npm install
npm run dev
```

- OTA: http://localhost:5173
- UTN web: http://localhost:8081/utn/
- OTA service: http://localhost:4100
- UTN service: http://localhost:4101

Copy `.env.example` to `.env` for server configuration. Set `OPENAI_API_KEY` server-side to enable actual image assessment. Never put it in `VITE_` or `EXPO_PUBLIC_` variables. Without the key the demo works, and AI mode returns an explicit configuration error.

## Presentation story

1. Select a curated Umrah journey in the OTA.
2. Enter a demo email. Select **Essential + UTN Trusted Network**.
3. Use **Fill demo travelers** for a fast demonstration, or complete the source-aligned OTA fields.
4. Review and confirm the data handoff. No payment or ministry request is made.
5. Open the personal UTN invitation. Each traveler gets a separate case.
6. Review the transferred data, select a category and upload the relevant image (or choose the clearly labeled demo scenario).
7. Assess the document. Only a verified result creates a demonstration/AI-assessment credential.
8. Return to the OTA. Its status changes through the actual signed callback, not shared browser state.

## Components

- `apps/ota`: React + Vite journey simulator, full traveler form and ministry-shaped payload preview.
- `apps/utn`: Expo + React Native universal app, six document routes, image upload, assessment findings, digital credential.
- `server`: separate HTTP services, token-scoped invitations, partner API, signed callbacks, retry outbox and vision adapter.
- `docs`: integration guide, OpenAPI, request examples and Postman collection.
- `deployment`: Cloudflare Worker and SQLite Durable Object persistence.

The public UTN contract builds on section 5.16, pages 27–36 of the supplied **OTA B2C Integration Guide v1.4.6**. It retains the root `groupInfo`, `package`, and `mutamers`; extension data belongs in `additionalInformation`. See `docs/UTN-INTEGRATION.md` for the authoritative implemented sandbox routes.

Government lookup IDs are not available in this environment. UI country choices use demo numeric ISO country values, explicitly not validated ministry IDs. Official disclosure questions and ministry image endpoints are not connected. The contract preserves these fields; this sandbox does not claim production visa-payload validation or send a visa request.

## iOS

The same UTN UI runs as a React Native app. `cd apps/utn` then `npx expo start` for development. Configure `EXPO_PUBLIC_UTN_API_URL` and `EXPO_PUBLIC_OTA_URL` before starting. The hosted API can be used from a physical device; a device's `localhost` is not the developer computer. Deep links use `utn://verify/<token>` in a development/native build. Expo Go has its own development URL and is not a distribution build. An installable signed iOS build requires Apple signing and an EAS/macOS build process; no IPA is included.

## Checks

```sh
npm run check
npm run typecheck -w apps/utn
npm test
node scripts/cloudflare-build.mjs
```

See `deployment/README.md` for deployment, the ignored test-access secret file, and the hosted smoke test. Source changes do not alter any existing Manasik Services deployment.

## Assessment and delivery scope

Demo mode is explicitly simulated. AI mode assesses visible readability, name/type/issuer consistency and expiry, routes uncertainty to review, and cannot authenticate an issuing authority or establish immigration eligibility. It never falls back silently to a simulated approval.

SMS/WhatsApp invitation previews and statuses identify whether a real provider is configured. Do not interpret a simulated notification as a delivered message. Real delivery requires provider credentials and approved templates.

This test environment uses capability invitations and a single sandbox partner. It is not a production identity service: production requires issuer verification, retention policy, stronger tenant identity and key rotation, proper rate limiting, operational review, and a privacy/security assessment. Use synthetic records for demonstrations.

Illustrative Makkah artwork was generated for this prototype; it is not an official photograph or endorsement. No government logos or partnership claims are used.
