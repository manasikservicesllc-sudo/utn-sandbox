# Persona Sandbox capture integration

The UTN web flow uses Persona Hosted Flow as a full-page capture experience.
It is followed by a separate OpenAI assessment of actual document images.
Camera guidance and selfie poses are controlled by that template, not by UTN.

## Required configuration

- Cloudflare Worker secret `PERSONA_API_KEY`: a Persona Sandbox server key.
- Worker setting/secret `PERSONA_TEMPLATE_ID`: an enabled `itmpl_…` KYC template
  including Government ID and Selfie verifications. Configure left/center/right
  capture if desired and allow the UTN return URL in its redirect settings.
- Key permissions to create, retrieve, and resume inquiries (including verification results).
- A workflow that decides the inquiry as `approved` or `declined`. Completion
  alone is not an approval in this integration.

Without both configuration values, `personaAvailable` is false and the existing
AI/demo experience remains available. Production keys are deliberately disabled.

## Request lifecycle

1. An invitation holder consents and POSTs `persona-session` beneath their existing
   `/api/invitations/{token}` URL, providing `category`, `documentType`, `consent:true`.
2. UTN creates one inquiry with a deterministic idempotency key. It returns only
   the inquiry ID and scoped session token for Hosted Flow; the API key stays server-side.
   Reopening resumes the same inquiry. Editing applicant details invalidates it locally.
3. When Hosted Flow returns to UTN, the client polls `POST .../persona-result` for up to about a
   minute. The customer can explicitly refresh a delayed decision or resume capture.
   There is no Persona webhook or unattended background polling in this version.
4. The server retrieves the bound inquiry directly from Persona. Browser-provided
   verdicts and inquiry IDs are never trusted. Pending/review/completed states stay pending.
5. An approved inquiry must also include related passed government-ID and selfie
   verifications before `simulatedOutcome` is `verified`. The UTN result remains `unverified`
   until a separate actual-document assessment is performed.
   The result uses `simulated:true`, `verificationLevel:persona_sandbox` and explicit scope.
   No authenticity certificate is issued for this sandbox integration.
6. UTN sends the final result through the existing signed OTA callback/retry flow.

## Validation status

Local tests cover consent, inquiry reuse, server-authoritative results, idempotent
delivery, incomplete outcomes, missing checks, and rejection of production keys.
Real end-to-end camera testing requires the account template and allowed-domain
configuration. A successful key read test does not establish those capabilities.

Native Persona SDK integration is not included; use the web invitation for this test.

References: https://docs.withpersona.com/hosted-flow and
https://docs.withpersona.com/api-reference/inquiries/create-an-inquiry

## October 10 correction: simulation is not OTA verification

Persona Sandbox approval now returns UTN unverified, with simulatedOutcome stored separately. It cannot issue a credential or imply that uploaded data matches OTA. Legacy sandbox-only approvals are revoked and callbacks reissued when the invitation is reopened.

The web capture opens the official Hosted Flow in a full browser page, then returns to the invitation. Allow the UTN return URL in Persona template redirect settings. After Persona completes, UTN requests actual document images for OpenAI data consistency assessment. Cards require distinct front/back images. This extra capture is an explicit Sandbox limitation: do not treat Persona fixture extraction as real document evidence. OpenAI results are scoped to data consistency, not face matching, liveness or issuer authentication. Persona simulation remains a separate result.

To require front/back inside Persona: Inquiries > Templates > KYC: GovID + Selfie > Verifications > Government ID > Countries and ID types > select card types > Required sides: Front + Back > Save > Publish. Passports use their data page. This configuration is controlled by the Persona dashboard and is not changed by the inquiry API key.

Reference: https://help.withpersona.com/articles/6RqFh33a2D2W9OBsTefqQt/
