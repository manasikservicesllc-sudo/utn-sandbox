# UTN welcome email

Every newly accepted UTN request creates one email notification per traveler using `mutamers[].emailAddress`. It includes the request/OTA booking number and that traveler's existing seven-day invitation link. No passport data or images are included.

Cloudflare Email Service integration is implemented in `deployment/worker.mjs`. Actual sending is disabled until domain onboarding is complete. `not_configured` is shown honestly in the OTA. SMS and WhatsApp remain simulated.

## Activate on the same Cloudflare account

1. Open Compute → Email Service → Email Sending and onboard `utn-staging.com`. Review the sending-specific SPF, DKIM, DMARC and bounce records. Preserve unrelated existing mail records.
2. Add `"send_email": [{ "name": "EMAIL" }]` to `deployment/wrangler.jsonc`.
3. Set `EMAIL_ENABLED` to `"true"`; the configured sender is `welcome@utn-staging.com`.
4. Deploy and test with a recipient you control. Example/test fixture domains never receive live mail. Before enabling unrestricted public-staging mail, configure recipient limits/abuse controls appropriate to the trial.

`accepted` means the provider accepted the message, not that it reached the inbox. `failed`, `invalid_recipient` and `not_configured` are reported separately. Request idempotency is persisted before sending; no automatic retry of ambiguous provider failures is performed to avoid duplicate emails. Existing requests are not retroactively sent when enabling email.

Official setup: https://developers.cloudflare.com/email-service/get-started/send-emails/
