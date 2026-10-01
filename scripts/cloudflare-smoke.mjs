import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const local = process.argv.includes("--local");
const base = local
  ? "http://localhost:8787"
  : "https://utn-otn.halavalet.workers.dev";
const apiBase = local ? base : "https://utn-api.halavalet.workers.dev";
const password = local
  ? "local-adapter-test"
  : JSON.parse(readFileSync(".data/cloudflare-secrets.json", "utf8"))
      .DEMO_PASSWORD;
const partnerKey = local
  ? "local-partner-test"
  : JSON.parse(readFileSync(".data/cloudflare-secrets.json", "utf8"))
      .SANDBOX_PARTNER_API_KEY;
assert.equal((await fetch(base + "/api/health")).status, 401);
const login = await fetch(base + "/presenter", {
  method: "POST",
  body: new URLSearchParams({ password }),
  redirect: "manual",
});
assert.equal(login.status, 303);
const cookie = login.headers.get("set-cookie").split(";")[0];
async function call(path, value, headers = {}) {
  const response = await fetch(base + path, {
    method: value ? "POST" : "GET",
    headers: { Cookie: cookie, "Content-Type": "application/json", ...headers },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${data.error || ""}`);
  return data;
}
assert.equal((await call("/api/health")).service, "ota");
assert.equal((await call("/api/utn/api/health")).service, "utn");
const booking = await call("/api/bookings", {
  serviceId: "utn",
  visaRequest: {
    groupInfo: { otaGroupId: 99001 },
    package: { otaPackageId: 99002 },
    mutamers: [
      {
        otaMutamerId: 1,
        firstNameEn: "Demo",
        familyNameEn: "Presenter",
        passportNumber: "SAMPLE",
        emailAddress: "demo@example.test",
      },
    ],
  },
  otaExtras: { countryOfResidence: "AE" },
});
assert.equal(booking.invitations.length, 1);
const path = "/api/utn/api/invitations/" + booking.invitations[0].token;
assert.equal((await call(path)).applicant.firstNameEn, "Demo");
const result = await call(path + "/verify", {
  category: "gcc_resident",
  documentType: "residence_permit",
  mode: "demo",
  scenario: "verified",
});
assert.equal(result.status, "verified");
assert.equal(result.callbackDelivered, true);
assert.equal(result.simulated, true);
assert.equal(
  (
    await call("/api/bookings/" + booking.id, null, {
      Authorization: "Bearer " + booking.accessToken,
    })
  ).status,
  "verified",
);
assert.ok((await call(path + "/certificate")).signature);
const externalPath = (local ? "/utn-api" : "") + "/v1/verification-requests";
assert.equal(
  (
    await fetch(apiBase + externalPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  401,
);
const external = await fetch(apiBase + externalPath, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
  body: JSON.stringify({
    groupInfo: { otaGroupId: 99101 },
    package: { otaPackageId: 99102 },
    mutamers: [
      {
        otaMutamerId: 1,
        firstNameEn: "Sandbox",
        familyNameEn: "Partner",
        mobileNumber: "+971000000000",
      },
    ],
    additionalInformation: { notificationMode: "demo" },
  }),
});
const externalData = await external.json();
assert.equal(external.status, 201, JSON.stringify(externalData));
assert.ok(externalData.id);
assert.equal(externalData.invitations.length, 1);
const nativePath =
  (local ? "/api/utn" : "") +
  "/api/invitations/" +
  externalData.invitations[0].token;
const native = await fetch(apiBase + nativePath);
assert.equal(native.status, 200);
assert.equal((await native.json()).applicant.firstNameEn, "Sandbox");
const requestState = await fetch(
  apiBase + externalPath + "/" + externalData.id,
  { headers: { "x-api-key": partnerKey } },
);
assert.equal(requestState.status, 200);
assert.ok(externalData.notifications.every((n) => n.status === "simulated"));
if (!local) {
  const shell = await fetch(
    "https://utn-testenvironment.halavalet.workers.dev/utn/",
  );
  assert.equal(shell.status, 200);
  const html = await shell.text();
  assert.ok(html.includes("_expo"));
  const asset = html.match(/src="([^"]+\.js)"/);
  assert.ok(asset);
  const js = await fetch(new URL(asset[1], shell.url));
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  const cors = await fetch(apiBase + nativePath, {
    method: "OPTIONS",
    headers: {
      Origin: "https://utn-testenvironment.halavalet.workers.dev",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(cors.status, 204);
  assert.equal(
    cors.headers.get("access-control-allow-origin"),
    "https://utn-testenvironment.halavalet.workers.dev",
  );
}
writeFileSync(
  ".data/cloudflare-smoke-result.json",
  JSON.stringify({
    base,
    checkedAt: new Date().toISOString(),
    gate: true,
    ota: true,
    utn: true,
    callback: true,
    certificate: true,
    externalPartner: true,
    nativeScopedAccess: true,
    syntheticInviteUrl: externalData.invitations[0].webUrl,
  }),
);
console.log(
  "PASS: password gate, both APIs, invitation, verification, callback, booking, certificate, external partner key and native scoped access.",
);
