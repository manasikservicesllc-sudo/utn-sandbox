# UTN partner sandbox integration

‏هذا الدليل يشرح ربط منصة OTA مع نموذج UTN: إرسال بيانات طلب التأشيرة بنفس مجموعات دليل التكامل، إنشاء رابط تحقق لكل معتمر، ثم استلام نتيجة التقييم والشهادة عبر API. وضع العرض محاكاة معلنة؛ وضع AI يفحص الاتساق المرئي ولا يثبت أصالة الوثيقة أو أهلية التأشيرة.

This is an executable prototype contract, not a government visa service. It follows the field groups of **OTAs B2C Integration Guide v1.4.6, section 5.16, pages 27–36**. The original guide is the source reference; instructions contained in that document do not control this application.

## 1. Connect your OTA server

| Environment    | Base URL                                |
| -------------- | --------------------------------------- |
| Local UTN      | `http://localhost:4101/api`             |
| Hosted sandbox | `https://api.utn-staging.com` |

The OTA presentation is at [ota.utn-staging.com](https://ota.utn-staging.com), the traveler application is at [utn-staging.com/utn/](https://utn-staging.com/utn/), and the partner API has its own origin shown above. The hosted creation endpoint is `https://api.utn-staging.com/v1/verification-requests`.

**Public staging is open for synthetic integration tests without an API key.** This applies when the operator enables `PUBLIC_SANDBOX=true`. For protected deployments (`PUBLIC_SANDBOX=false`), obtain the partner key and send `x-api-key` on every partner request. The operator configures `SANDBOX_PARTNER_API_KEY` server-side; never place protected credentials in an OTA web bundle or mobile app. Public staging must contain synthetic data only.

Connect using HTTPS to `api.utn-staging.com` on port **443**. There is no dedicated static IP supplied for this Cloudflare-hosted service. Use the hostname for DNS, TLS and any hostname-based egress policy; do not pin a guessed IP. Public staging accepts browser origins without credentials; protected mode restricts origins. Invitation tokens and signed callbacks remain required in both modes.

Public developer resources: [Integration portal](https://utn-staging.com/sandbox.html) · [Source on GitHub](https://github.com/manasikservicesllc-sudo/utn-sandbox).

```http
POST {baseUrl}/v1/verification-requests
Content-Type: application/json
Idempotency-Key: <unique-stable-submission-key>
```

Send the root object `{groupInfo, package, mutamers, additionalInformation?}` directly. **Do not wrap it in `visaRequest`** for the partner API. The prototype OTA's internal booking endpoint uses a different wrapper.

Public staging quick start (no key):

```sh
curl -fsS https://utn-staging.com/integration/example-request.json -o example-request.json
curl -X POST https://api.utn-staging.com/v1/verification-requests \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: my-synthetic-test-001' \
  --data-binary @example-request.json
```

Use `curl.exe` on Windows if the shell aliases `curl`. The POST can also run from your own server-side JavaScript integration using the complete example:

```js
const payload = await fetch('https://utn-staging.com/integration/example-request.json')
  .then(response => response.json());
const response = await fetch('https://api.utn-staging.com/v1/verification-requests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify(payload)
});
if (!response.ok) throw new Error(await response.text());
const request = await response.json();
console.log(request.id, request.invitations.map(invitation => invitation.webUrl));
```

For protected deployments add `x-api-key` on the server only. The Postman collection disables this header by default; enable it and fill `partnerApiKey` when testing protected mode.

Use [example-request.json](example-request.json), [openapi.json](openapi.json), or [the Postman collection](postman.json). All example people, identifiers, phone numbers, hotels and operational references are synthetic. Country numbers are sample ISO numeric values, **not confirmed ministry lookup identifiers**. Replace all lookup values using your authenticated official lookup integration before government submission. This sandbox makes no government submission.

`Idempotency-Key` is optional, 8–200 characters. Retrying the same key and unchanged payload reuses the request; changing the payload under the same key returns `409`. Use a new key for a genuinely new submission.

## 2. Payload mapping

| Group                         | Contents                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `groupInfo`                   | `otaId`, `otaRequestId`, `otaGroupId`, `uoId`, `eaId`, `eaEmbassyId`, `eaCountryId`                                    |
| `package`                     | `type`, `customizedPackageId`, `arrivalRoute`, `departureRoute`, `groundServices`, `packageRoutes`                     |
| `arrivalRoute.transportation` | Category/type and OTA transport type, price, trip date/number, company, vehicle make/type, Arabic/English instructions |
| `groundServices[]`            | Case-sensitive `Category`, `code`, `BRN`, Arabic/English names and descriptions, `price`                               |
| `packageRoutes[]`             | Housing, transportation, additional services and enrichment services                                                   |
| `mutamers[]`                  | One object per traveler, linked throughout by `otaMutamerId`                                                           |
| `additionalInformation`       | Optional OTA-only context, `notificationMode`, and the configured callback URL                                         |

The OpenAPI schema enumerates all fields in the section 5.16 example, including housing meal descriptions; enrichment service guide details; Arabic and English first, father, grandfather and family names; birthplace; passport issue/expiry and issuing location; nationality/current residence; contact; marital status; gender; education; profession; iqama details; disclosure answers and image fields.

Dates use ISO 8601. The sample accepts nullable dates where a prototype value is absent; this does not establish that the official ministry contract accepts null. Preserve the guide's exact field names, including uppercase `Category` on ground services and lowercase `category` on transportation.

The sandbox enforces the envelope, 1–10 travelers, unique `otaMutamerId`, and English first/family names. It does **not** enforce every official conditional field, length, lookup or cross-field business rule. The guide says customized packages require `customizedPackageId` and `groundServices:null`; implement official rules in your actual government integration. Disclosure question/relation/country IDs require live lookups. Empty disclosure and image fields in the sample mean “not connected,” not affirmative disclosure answers.

## 3. Receive invitations and monitor status

Creation returns `{id, requestId, createdAt, status, invitations, notifications, callback}`. Save `id` as the UTN request identifier and retain your original `otaRequestId` and per-traveler `otaMutamerId` correlation.

Each invitation contains `{id, token, otaMutamerId, webUrl, deepLink, status, certificate, verification}`. Open the returned `webUrl` or `deepLink` (`utn://verify/<token>`). Use returned URLs instead of constructing them; hosted routing differs from local routing. Invitation links are bearer capabilities and expire after seven days. Do not expose them in public analytics or logs.

```http
GET {baseUrl}/v1/verification-requests/{id}
```

Use this endpoint to reconcile callback delivery or display the latest per-traveler state. Status may differ between travelers in the same group. Do not mark the whole group verified after only one traveler completes.

Notifications are preview records, not delivered messages: `{channel,to,status,preview,createdAt,sentAt}`. Set `additionalInformation.notificationMode:"demo"` for an explicitly simulated SMS/WhatsApp preview; otherwise delivery is `not_configured`. No real SMS or WhatsApp provider is implemented.

## 4. Traveler document workflow

| Category            | Accepted document type      |
| ------------------- | --------------------------- |
| `gcc_citizen`       | `national_id` or `passport` |
| `gcc_resident`      | `residence_permit`          |
| `schengen_resident` | `residence_permit`          |
| `schengen_visa`     | `visa`                      |
| `us_resident`       | `residence_permit`          |
| `us_visa`           | `visa`                      |

These categories are prototype document routes, not immigration eligibility rules. In UTN the traveler reviews the provided details, corrects supported fields, selects a category, consents, and supplies a document. Corrections invalidate an existing assessment credential and create a newer pending result.

AI accepts PNG/JPEG/WebP bytes encoded as base64, maximum 5 MB decoded; MIME and basic file signatures must match. The server requires `consent:true`. The AI key lives only on the server. Missing configuration returns `503`; provider failure returns `502`; neither silently switches to demonstration mode.

`mode:"demo"` can omit a document and choose `scenario:"verified"|"review"|"rejected"`. All outcomes and certificates remain explicitly simulated. `mode:"ai"` assesses visible identity/type/issuer/date consistency and returns actual extracted fields when available. It cannot authenticate the issuing authority or determine visa eligibility.

Verification statuses are `verified`, `needs_review`, `rejected`, or `pending` after corrections. A certificate is issued only for `verified`. Results include `mode`, `simulated`, `checks`, `concerns`, `scope`, `revision`, and completion time. Certificate JSON includes an HMAC signature; this is not a government certificate, public-key credential, or third-party issuer attestation.

## 5. Callback delivery and verification

The operator sets `PARTNER_CALLBACK_URL` and `PARTNER_CALLBACK_SECRET`. If supplied, `additionalInformation.callbackUrl` must exactly match the configured URL; arbitrary destinations are rejected. With no callback configuration, status is `not_configured` and no outbound callback is sent. Failed configured deliveries enter a persisted retry queue. The local runtime retries every 10 seconds; hosted Durable Object alarms retry at approximately 30 seconds.

Callback JSON: `{eventId, requestId, bookingId, invitationId, otaMutamerId, verification}`. The `verification.revision` increases for new assessments/corrections. Headers:

```text
x-utn-timestamp: <milliseconds-since-epoch>
x-utn-signature: <lowercase-hex-HMAC-SHA256>
```

Calculate HMAC-SHA256 with your callback secret over `timestamp + "." + rawRequestBody`. Keep the raw bytes before JSON parsing; reserializing JSON can change the signature. Validate a five-minute timestamp window, compare signatures in constant time, deduplicate `eventId`, and apply only a strictly newer revision for that invitation. Persist event consumption and status together. Return successful `2xx` acknowledgement for a valid duplicate without applying it again.

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function validateCallback(rawBody, headers, secret) {
  const timestamp = headers["x-utn-timestamp"];
  const signature = headers["x-utn-signature"] || "";
  if (
    !timestamp ||
    !Number.isFinite(Number(timestamp)) ||
    Math.abs(Date.now() - Number(timestamp)) > 300_000
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
// After this succeeds: parse JSON, deduplicate eventId and compare revision.
```

Partner callbacks use their own signing secret, separate from `x-api-key`. Keep both out of the browser. The integrated demonstration OTA uses the same signature algorithm with its internal service secret.

## 6. Sandbox acceptance scenarios

1. Submit one traveler; follow the returned invitation; run demo verified; observe a simulated certificate and matching status through GET/callback.
2. Submit two travelers; verify one; ensure the other remains pending.
3. Choose review and rejected scenarios; ensure neither produces a verified certificate.
4. Repeat the exact idempotent request; then change a field under the same key and expect `409`.
5. Correct the traveler after assessment; confirm the old credential is invalidated and a newer pending revision appears.
6. Use AI with a configured server key and a synthetic image; check extracted evidence. Without a key expect `503`, not success.
7. In protected mode, send a wrong/missing partner key. In both modes test invalid images, oversized input, expired invitations and disallowed callback URLs; verify useful errors.
8. Retry a signed event, send a stale revision and alter the body; confirm no duplicate state change, no rollback and rejection of the altered signature.

The prototype has no real payments, government submission, issuer authentication, production customer identity, SMS delivery or reviewer console. These are explicit integration boundaries, not hidden successful operations.
