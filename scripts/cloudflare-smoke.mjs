import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const local = process.argv.includes("--local");
const base = local
  ? "http://localhost:8787"
  : "https://ota.utn-staging.com";
const apiBase = local ? base : "https://api.utn-staging.com";
const partnerHeaders=local?{"x-api-key":"local-partner-test"}:{};
assert.equal((await fetch(base + "/api/health")).status, local?401:200);
let cookie="";
if(local){
 const login=await fetch(base+"/presenter",{method:"POST",body:new URLSearchParams({password:"local-adapter-test"}),redirect:"manual"});
 assert.equal(login.status,303);cookie=login.headers.get("set-cookie").split(";")[0];
}else{assert.equal((await fetch(base)).status,200);}
async function call(path, value, headers = {}) {
  const response = await fetch(base + path, {
    method: value ? "POST" : "GET",
    headers: { ...(cookie?{Cookie:cookie}:{}), "Content-Type": "application/json", ...headers },
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
  local?401:400,
);
const external = await fetch(apiBase + externalPath, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...partnerHeaders, ...(local?{}:{Origin:"https://external-partner.example"}) },
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
  { headers: partnerHeaders },
);
assert.equal(requestState.status, 200);
assert.ok(externalData.notifications.every((n) => n.status === "simulated"));
if (!local) {
  const shell = await fetch(
    "https://utn-staging.com/utn/",
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
      Origin: "https://external-partner.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(cors.status, 204);
  assert.equal(
    cors.headers.get("access-control-allow-origin"),
    "https://external-partner.example",
  );
  const guide=await fetch("https://utn-staging.com/integration-guide");assert.equal(guide.status,200);assert.ok((await guide.text()).includes("api.utn-staging.com"));
}
writeFileSync(
  ".data/cloudflare-smoke-result.json",
  JSON.stringify({
    base,
    checkedAt: new Date().toISOString(),
    publicSandbox: !local,
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
  "PASS: staging access mode, both APIs, invitation, verification, callback, booking, certificate, external intake, CORS, guide and native scoped access.",
);
