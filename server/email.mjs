const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function invitationEmail({ requestNumber, webUrl }) {
  const subject = `UTN | استلمنا طلبك رقم ${requestNumber}`;
  const text = `مرحبًا بك في شبكة UTN لخدمات العمرة.\nاستلمنا طلبك رقم ${requestNumber}.\nأكمل التحقق من مستنداتك عبر رابطك الخاص:\n${webUrl}\nالرابط صالح لمدة 7 أيام. لا تشاركه مع الآخرين.\n\nWelcome to UTN. Your request ${requestNumber} has been received. Complete your document check using the private link above. This link expires in 7 days.\nUTN staging — بيئة تجريبية`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f6f5ef;font-family:Arial,sans-serif;color:#183c34"><main style="max-width:560px;margin:auto;padding:32px 20px"><p style="letter-spacing:3px">UTN · TRUSTED NETWORK</p><h1>مرحبًا بك في شبكة UTN</h1><p>استلمنا طلبك لخدمات العمرة.</p><p>رقم الطلب: <strong dir="ltr">${escape(requestNumber)}</strong></p><p>بياناتك جاهزة. أكمل التحقق من مستنداتك عبر الرابط الخاص بك.</p><p style="margin:28px 0"><a href="${escape(webUrl)}" style="display:inline-block;padding:16px 24px;background:#183c34;color:white;text-decoration:none;border-radius:8px">إكمال التحقق · Continue verification</a></p><p>الرابط صالح لمدة 7 أيام. لا تشاركه مع الآخرين.</p><hr><p dir="ltr">Welcome to UTN. Your request has been received. Use the button above to complete your document check.</p><p style="font-size:12px">UTN staging · بيئة تجريبية</p><p style="overflow-wrap:anywhere;font-size:12px"><a href="${escape(webUrl)}">${escape(webUrl)}</a></p></main></body></html>`;
  return { subject, text, html };
}

export async function dispatchEmail(notification, { sendEmail, from }) {
  if (!notification.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notification.to)) {
    notification.status = "invalid_recipient";
    return;
  }
  // Demo fixture addresses must never trigger real delivery.
  if (/@(?:example\.(?:com|org|net|test)|[^@]+\.test)$/i.test(notification.to)) {
    notification.status = "simulated";
    return;
  }
  if (!sendEmail || !from) { notification.status = "not_configured"; return; }
  notification.status = "sending";
  try {
    const response = await sendEmail({ from, to: notification.to, subject: notification.subject, text: notification.preview, html: notification.html });
    notification.status = "accepted"; // Provider acceptance is not inbox delivery.
    notification.providerMessageId = response?.messageId || null;
    notification.acceptedAt = new Date().toISOString();
  } catch {
    notification.status = "failed";
    notification.error = "Email provider did not confirm acceptance. Check Email Service configuration and logs.";
  }
}
