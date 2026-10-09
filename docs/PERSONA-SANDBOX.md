# Persona Sandbox capture integration

The UTN web flow uses the official `persona` Web SDK (5.9.0). When configured,
it replaces local document capture with the template's Persona experience.
Camera guidance and selfie poses are controlled by that template, not by UTN.

## Required configuration

- Cloudflare Worker secret `PERSONA_API_KEY`: a Persona Sandbox server key.
- Worker setting/secret `PERSONA_TEMPLATE_ID`: an enabled `itmpl_…` KYC template
  including Government ID and Selfie verifications. Configure left/center/right
  capture if desired and allow `https://utn-staging.com` in its embedding settings.
- Key permissions to create, retrieve, and resume inquiries (including verification results).
- A workflow that decides the inquiry as `approved` or `declined`. Completion
  alone is not an approval in this integration.

Without both configuration values, `personaAvailable` is false and the existing
AI/demo experience remains available. Production keys are deliberately disabled.

## Request lifecycle

1. An invitation holder consents and POSTs `persona-session` beneath their existing
   `/api/invitations/{token}` URL, providing `category`, `documentType`, `consent:true`.
2. UTN creates one inquiry with a deterministic idempotency key. It returns only
   the inquiry ID and scoped session token to the Web SDK; the API key stays server-side.
   Reopening resumes the same inquiry. Editing applicant details invalidates it locally.
3. When the SDK completes, UTN polls `POST .../persona-result` for up to about a
   minute. The customer can explicitly refresh a delayed decision or resume capture.
   There is no Persona webhook or unattended background polling in this version.
4. The server retrieves the bound inquiry directly from Persona. Browser-provided
   verdicts and inquiry IDs are never trusted. Pending/review/completed states stay pending.
5. An approved inquiry must also include related passed government-ID and selfie
   verifications before UTN returns `verified`; other final outcomes become `unverified`.
   The result uses `simulated:true`, `verificationLevel:persona_sandbox` and explicit scope.
   No authenticity certificate is issued for this sandbox integration.
6. UTN sends the final result through the existing signed OTA callback/retry flow.

## Validation status

Local tests cover consent, inquiry reuse, server-authoritative results, idempotent
delivery, incomplete outcomes, missing checks, and rejection of production keys.
Real end-to-end camera testing requires the account template and allowed-domain
configuration. A successful key read test does not establish those capabilities.

Native Persona SDK integration is not included; use the web invitation for this test.

References: https://docs.withpersona.com/embedded-flow and
https://docs.withpersona.com/api-reference/inquiries/create-an-inquiry
