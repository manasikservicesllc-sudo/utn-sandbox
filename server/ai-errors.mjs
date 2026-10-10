// Never forward provider error messages: they may echo request data or credentials.
export async function aiFailure(response) {
  const payload = await response.json().catch(() => ({}));
  const code = payload?.error?.code;
  const type = payload?.error?.type;
  let reason = 'request_failed';
  let message = 'تعذر إكمال الفحص. حاول مجددًا، وإذا استمر الخطأ تواصل مع الدعم. · Assessment unavailable; retry or contact support.';
  let status = 502;
  if (['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'].includes(code) || type === 'insufficient_quota') {
    reason = 'account_limit'; status = 503;
    message = 'الفحص متوقف بسبب رصيد أو حدود حساب الخدمة. يلزم أن يراجع مسؤول الخدمة الحساب. · Service account credits or usage limits require administrator attention.';
  } else if (response.status === 429) {
    reason = 'rate_limited'; status = 429;
    message = 'طلبات الفحص كثيرة حاليًا. انتظر قليلًا ثم أعد المحاولة؛ الصور ما زالت في هذه الصفحة. · Temporarily busy. Wait before retrying; keep this page open.';
  } else if (response.status >= 500) {
    reason = 'provider_unavailable'; status = 503;
    message = 'خدمة الفحص غير متاحة مؤقتًا. احتفظ بالصفحة وحاول لاحقًا. · Assessment temporarily unavailable. Keep this page open and retry later.';
  } else if ([401,403].includes(response.status) || code === 'model_not_found') {
    reason = 'configuration'; status = 503;
    message = 'تعذر اتصال خدمة الفحص. يلزم مراجعة الإعدادات بواسطة الدعم. · Assessment configuration requires support attention.';
  } else if (['invalid_image','invalid_image_format','invalid_base64_image','invalid_image_url','image_parse_error','image_too_large','image_too_small','unsupported_image'].includes(code)) {
    reason = 'invalid_image'; status = 422;
    message = 'تعذرت قراءة إحدى الصورتين. أعد تصويرها أو ارفع صورة JPG أو PNG واضحة. · An image could not be read. Retake it or upload a clear JPG or PNG.';
  }
  const requestId = response.headers.get('x-request-id');
  const safeId = /^req_[A-Za-z0-9_-]{1,100}$/.test(requestId || '') ? requestId : null;
  console.warn(JSON.stringify({event:'ai_provider_failure',status:response.status,reason,requestId:safeId}));
  return {status, message:message + ` [AI_${reason.toUpperCase()}]` + (safeId ? ` Reference: ${safeId}` : '')};
}
