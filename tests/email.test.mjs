import test from "node:test";
import assert from "node:assert/strict";
import { invitationEmail, dispatchEmail } from "../server/email.mjs";

test("email uses a private invitation URL and safely escapes template data", () => {
  const mail = invitationEmail({ requestNumber: '<script>alert(1)</script>', webUrl: 'https://utn-staging.com/utn/?token=synthetic' });
  assert.ok(mail.text.includes('?token=synthetic'));
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(mail.html.includes('&lt;script&gt;'));
});
test("email delivery distinguishes missing configuration, fixtures, acceptance and failure", async () => {
  const mail = {to:'tester@recipient.invalid', subject:'Test', preview:'Test', html:'<p>Test</p>'};
  await dispatchEmail(mail, {});
  assert.equal(mail.status, 'not_configured');
  let calls = 0;
  const config = {from:'welcome@utn-staging.com', sendEmail: async payload => {calls++; assert.equal(payload.to, mail.to); return {messageId:'test-id'};}};
  await dispatchEmail({...mail,to:'traveler@example.com'}, config);
  assert.equal(calls, 0);
  await dispatchEmail(mail, config);
  assert.equal(mail.status, 'accepted');
  assert.equal(mail.providerMessageId, 'test-id');
  assert.equal(mail.sentAt, undefined);
  await dispatchEmail(mail, {...config,sendEmail:async()=>{throw Error('secret provider detail');}});
  assert.equal(mail.status, 'failed');
  assert.ok(!mail.error.includes('secret provider detail'));
});
