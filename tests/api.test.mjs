import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServices } from "../server/services.mjs";
import { sign, post } from "../server/shared.mjs";
import { reviewImage } from "../server/ai.mjs";
const secret = "integration-test-secret";
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "utn-test-"));
  const s = await startServices({
    dataDir: dir,
    otaPort: 0,
    utnPort: 0,
    secret,
    apiKey: "",
    partnerApiKey: "test-partner-key",
    publicSandbox: false,
    ...options,
  });
  t.after(async () => {
    await s.close();
    await rm(dir, { recursive: true, force: true });
  });
  return s;
}
async function call(url, value, headers = {}) {
  const r = await fetch(url, {
    method: value ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const booking = (count = 1) => ({
  serviceId: "essential-utn",
  visaRequest: {
    groupInfo: { otaGroupId: 100 },
    package: { otaPackageId: 200 },
    mutamers: Array.from({ length: count }, (_, n) => ({
      otaMutamerId: n + 1,
      firstNameEn: "Demo",
      familyNameEn: `Pilgrim${n + 1}`,
      passportNumber: "SAMPLE123",
      emailAddress: "demo@example.test",
    })),
  },
  otaExtras: { countryOfResidence: "AE" },
});
const verify = {
  category: "gcc_resident",
  documentType: "residence_permit",
  mode: "demo",
  scenario: "verified",
};
test("other category accepts supported documents and never auto-issues a credential", async (t) => {
  const s = await setup(t);
  const b = await call(s.otaUrl + "/api/bookings", booking());
  const url = s.utnUrl + "/api/invitations/" + b.data.invitations[0].token;
  for (const documentType of ["passport", "residence_permit", "visa"]) {
    const result = await call(url + "/verify", { ...verify, category: "other", documentType });
    assert.equal(result.status, 200);
    assert.equal(result.data.status, "needs_review");
    assert.ok(!result.data.certificate);
    assert.equal((await call(url + "/certificate")).status, 404);
  }
  assert.equal((await call(url + "/verify", { ...verify, category: "other", documentType: "national_id" })).status, 400);
});
test("multi-applicant round trip, scoped invitation, signed certificate and persisted callback", async (t) => {
  const s = await setup(t);
  const b = await call(s.otaUrl + "/api/bookings", booking(2));
  assert.equal(b.status, 201);
  assert.equal(b.data.invitations.length, 2);
  assert.ok(b.data.utnRequestId.startsWith("REQ-"));
  assert.equal(b.data.notifications.length, 4);
  assert.equal(b.data.notifications[0].status, "simulated");
  assert.ok(b.data.notifications[0].preview.includes(b.data.id));
  assert.ok(b.data.notifications[0].preview.includes(b.data.invitations[0].webUrl));
  assert.equal(
    (await call(s.otaUrl + "/api/bookings/" + b.data.id)).status,
    401,
  );
  const invite = b.data.invitations[0];
  const info = await call(s.utnUrl + "/api/invitations/" + invite.token);
  assert.equal(info.data.applicant.otaMutamerId, 1);
  assert.equal(info.data.applicant.emailAddress, "demo@example.test");
  assert.equal(info.data.booking.mutamers, undefined);
  const result = await call(
    s.utnUrl + "/api/invitations/" + invite.token + "/verify",
    verify,
  );
  assert.equal(result.data.status, "verified");
  assert.equal(result.data.simulated, true);
  assert.equal(result.data.callbackDelivered, true);
  assert.equal(result.data.extractedFieldsSource, "simulated_fixture");
  assert.equal(
    result.data.extractedFields.issuingCountry,
    "Demonstration issuer",
  );
  let current = await call(s.otaUrl + "/api/bookings/" + b.data.id, null, {
    Authorization: "Bearer " + b.data.accessToken,
  });
  assert.equal(current.data.status, "pending_verification");
  await call(
    s.utnUrl + "/api/invitations/" + b.data.invitations[1].token + "/verify",
    verify,
  );
  current = await call(s.otaUrl + "/api/bookings/" + b.data.id, null, {
    Authorization: "Bearer " + b.data.accessToken,
  });
  assert.equal(current.data.status, "verified");
  assert.equal(current.data.invitations[0].status, "verified");
  assert.ok(current.data.invitations[0].certificate.id);
  const cert = await call(
    s.utnUrl + "/api/invitations/" + invite.token + "/certificate",
  );
  const { signature, ...unsigned } = cert.data;
  assert.equal(signature, sign(JSON.stringify(unsigned), secret));
});
test("essential service skips UTN and idempotency preserves identity while rejecting changed payloads", async (t) => {
  const s = await setup(t);
  const payload = { ...booking(), serviceId: "essential" };
  payload.visaRequest.groupInfo.otaRequestId = 1234;
  const headers = { "Idempotency-Key": "unique-essential-request" };
  const first = await call(s.otaUrl + "/api/bookings", payload, headers);
  assert.equal(first.status, 201);
  assert.equal(first.data.status, "not_required");
  assert.deepEqual(first.data.invitations, []);
  assert.equal(first.data.requestId, 1234);
  const replay = await call(s.otaUrl + "/api/bookings", payload, headers);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, first.data.id);
  assert.equal(replay.data.idempotentReplay, true);
  assert.equal(
    (
      await call(
        s.otaUrl + "/api/bookings",
        { ...payload, serviceId: "utn" },
        headers,
      )
    ).status,
    409,
  );
  const utnPayload = { ...payload, serviceId: "utn" };
  const utnHeaders = { "Idempotency-Key": "unique-utn-request" };
  const utnFirst = await call(
    s.otaUrl + "/api/bookings",
    utnPayload,
    utnHeaders,
  );
  const utnReplay = await call(
    s.otaUrl + "/api/bookings",
    utnPayload,
    utnHeaders,
  );
  assert.equal(utnFirst.data.invitations.length, 1);
  assert.equal(
    utnReplay.data.invitations[0].token,
    utnFirst.data.invitations[0].token,
  );
  const options = await fetch(s.otaUrl + "/api/bookings", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Headers": "idempotency-key",
    },
  });
  assert.match(
    options.headers.get("Access-Control-Allow-Headers"),
    /Idempotency-Key/,
  );
});
test("invalid signature, invalid category/type, bad upload and absent AI key fail safely", async (t) => {
  const s = await setup(t);
  const b = (await call(s.otaUrl + "/api/bookings", booking())).data;
  const url = s.utnUrl + "/api/invitations/" + b.invitations[0].token;
  assert.equal(
    (await call(s.otaUrl + "/api/webhooks/utn", { bookingId: b.id })).status,
    401,
  );
  assert.equal(
    (await call(url + "/verify", { ...verify, category: "gcc_citizen" }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(url + "/verify", {
        ...verify,
        document: {
          mimeType: "image/png",
          base64: Buffer.from("not a png").toString("base64"),
        },
      })
    ).status,
    400,
  );
  const document = {
    name: "sample.png",
    mimeType: "image/png",
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=",
  };
  assert.equal(
    (await call(url + "/verify", { ...verify, mode: "ai", document })).status,
    400,
  );
  assert.equal(
    (
      await call(url + "/verify", {
        ...verify,
        mode: "ai",
        document,
        consent: true,
      })
    ).status,
    503,
  );
  assert.equal((await call(url + "/certificate")).status, 404);
  const review = await call(url + "/verify", { ...verify, scenario: "review" });
  assert.equal(review.data.status, "needs_review");
  assert.equal(review.data.certificate, undefined);
  assert.equal(
    (
      await call(s.otaUrl + "/api/bookings/" + b.id, null, {
        Authorization: "Bearer " + b.accessToken,
      })
    ).data.status,
    "needs_review",
  );
});
test("callback replay is idempotent and untrusted browser origins are rejected", async (t) => {
  const s = await setup(t);
  const b = (await call(s.otaUrl + "/api/bookings", booking())).data;
  const i = b.invitations[0];
  const payload = {
    eventId: "same-event",
    bookingId: b.id,
    invitationId: i.id,
    otaMutamerId: 1,
    verification: { status: "needs_review" },
  };
  const stamp = String(Date.now());
  const headers = {
    "x-utn-timestamp": stamp,
    "x-utn-signature": sign(stamp + "." + JSON.stringify(payload), secret),
  };
  assert.equal(
    (await call(s.otaUrl + "/api/webhooks/utn", payload, headers)).status,
    200,
  );
  assert.equal(
    (await call(s.otaUrl + "/api/webhooks/utn", payload, headers)).data
      .duplicate,
    true,
  );
  assert.equal(
    (
      await call(s.utnUrl + "/api/health", null, {
        Origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
});
test("AI assessment gates certificates on every visible check and never asserts authenticity", async (t) => {
  const originalFetch = globalThis.fetch;
  let assessment = {
    readable: true,
    nameMatches: true,
    typeMatches: true,
    expiryDate: "2099-01-01",
    issuerConsistent: true,
    concerns: [],
  };
  globalThis.fetch = async (url, options) => {
    if (url !== "https://api.openai.com/v1/responses")
      return originalFetch(url, options);
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.equal(request.input[0].content[1].type, "input_image");
    return new Response(
      JSON.stringify({
        output: [
          {
            content: [
              { type: "output_text", text: JSON.stringify(assessment) },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const input = {
    applicant: { firstNameEn: "Demo", familyNameEn: "Person" },
    category: "gcc_resident",
    documentType: "residence_permit",
    document: { mimeType: "image/png", base64: "fixture" },
  };
  const config = { apiKey: "test-only", model: "test-model" };
  const clear = await reviewImage(input, config);
  assert.equal(clear.status, "verified");
  assert.equal(clear.simulated, false);
  assert.match(clear.scope, /not issuer authentication/);
  assessment = { ...assessment, nameMatches: false };
  assert.equal((await reviewImage(input, config)).status, "needs_review");
  assessment = { ...assessment, nameMatches: true, expiryDate: "2001-01-01" };
  assert.equal((await reviewImage(input, config)).status, "needs_review");
  assessment = { ...assessment, expiryDate: null };
  assert.equal((await reviewImage(input, config)).status, "needs_review");
});
test("direct partner intake authenticates, preserves ministry-shaped body, reports honest notifications and blocks arbitrary callbacks", async (t) => {
  const s = await setup(t);
  const url = s.utnUrl + "/api/v1/verification-requests";
  const payload = {
    ...booking(2).visaRequest,
    additionalInformation: { notificationMode: "demo" },
  };
  const headers = {
    "x-api-key": "test-partner-key",
    "Idempotency-Key": "partner-request-123",
  };
  assert.equal((await call(url, payload)).status, 401);
  assert.equal(
    (
      await call(
        url,
        {
          ...payload,
          additionalInformation: { callbackUrl: "http://127.0.0.1/admin" },
        },
        headers,
      )
    ).status,
    400,
  );
  const created = await call(url, payload, headers);
  assert.equal(created.status, 201);
  assert.equal(created.data.invitations.length, 2);
  assert.equal(created.data.notifications.length, 4);
  assert.ok(
    created.data.notifications.every(
      (n) => n.status === "simulated" && n.sentAt === null,
    ),
  );
  assert.equal(created.data.callback.configured, false);
  const repeated = await call(url, payload, headers);
  assert.equal(repeated.data.id, created.data.id);
  const invite = created.data.invitations[0];
  await call(s.utnUrl + "/api/invitations/" + invite.token + "/verify", verify);
  const status = await call(url + "/" + created.data.id, null, headers);
  assert.equal(status.data.invitations[0].status, "verified");
  assert.equal(status.data.callback.deliveries[0].status, "not_configured");
  assert.equal((await call(url + "/" + created.data.id)).status, 401);
  const plain = await call(
    url,
    { ...booking().visaRequest },
    { "x-api-key": "test-partner-key" },
  );
  assert.ok(
    plain.data.notifications.every((n) => n.status === "not_configured"),
  );
});
test("applicant corrections revoke certificate and signed external callbacks use registered URL and separate secret", async (t) => {
  const deliveries = [];
  const callback = "https://partner.example/callback";
  const s = await setup(t, {
    partnerCallbackUrl: callback,
    partnerCallbackSecret: "partner-signing-secret",
    post: async (url, value, headers) => {
      if (url === callback) {
        deliveries.push({ value, headers });
        return { received: true };
      }
      return post(url, value, headers);
    },
  });
  const created = (
    await call(
      s.utnUrl + "/api/v1/verification-requests",
      {
        ...booking().visaRequest,
        additionalInformation: { callbackUrl: callback },
      },
      { "x-api-key": "test-partner-key" },
    )
  ).data;
  const inviteUrl =
    s.utnUrl + "/api/invitations/" + created.invitations[0].token;
  await call(inviteUrl + "/verify", verify);
  assert.equal((await call(inviteUrl + "/certificate")).status, 200);
  const r = await fetch(inviteUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicant: { firstNameEn: "Corrected" } }),
  });
  const corrected = await r.json();
  assert.equal(r.status, 200);
  assert.equal(corrected.status, "pending");
  assert.equal(corrected.applicant.firstNameEn, "Corrected");
  assert.equal(corrected.audit.length, 1);
  assert.equal((await call(inviteUrl + "/certificate")).status, 404);
  assert.equal(deliveries.length, 2);
  const last = deliveries.at(-1);
  assert.equal(last.value.verification.status, "pending");
  assert.equal(
    last.headers["x-utn-signature"],
    sign(
      last.headers["x-utn-timestamp"] + "." + JSON.stringify(last.value),
      "partner-signing-secret",
    ),
  );
  const bad = await fetch(inviteUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicant: { otaMutamerId: "999" } }),
  });
  assert.equal(bad.status, 400);
});

test('explicit public sandbox permits no-key partner intake and any origin while retaining token scopes', async t => {
  const s = await setup(t, {publicSandbox:true});
  const origin='https://external-developer.example';
  const url=s.utnUrl+'/api/v1/verification-requests';
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(booking().visaRequest)});
  assert.equal(response.status,201);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  const request=await response.json();
  assert.equal((await call(url+'/'+request.id,null,{Origin:origin})).status,200);
  assert.equal((await call(s.utnUrl+'/api/invitations/not-a-valid-token',null,{Origin:origin})).status,404);
  assert.equal((await call(s.otaUrl+'/api/webhooks/utn',{bookingId:'fake'},{Origin:origin})).status,401);
  assert.equal((await call(s.utnUrl+'/api/health')).data.publicSandbox,true);
  const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
});
