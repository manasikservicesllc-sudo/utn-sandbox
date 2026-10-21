import {fail, equal, sign} from './shared.mjs';

// Contract: integration guide (13 Oct) and Athbit Partner SOP (18 Oct 2026).
// Opt-in only. No credentials or customer data are sent until configured.
export function createAthbit({baseUrl,apiKey,webhookSecret,returnUrl,fetchImpl=fetch}={}) {
  const enabled=!!(baseUrl || apiKey || webhookSecret || returnUrl);
  function ready() {
    if(!baseUrl || !apiKey || !webhookSecret || !returnUrl) fail(503,'Athbit integration configuration is incomplete');
    if(!/^athbit_test_[A-Za-z0-9]{32}$/.test(apiKey)) fail(503,'Athbit staging requires a test key');
    for(const value of [baseUrl,returnUrl]) {
      let u; try {u=new URL(value);} catch {fail(503,'Invalid Athbit URL configuration');}
      if(u.protocol!=='https:' || u.username || u.password || u.hash) fail(503,'Athbit URLs must use HTTPS without credentials');
    }
    if(new URL(baseUrl).search || returnUrl.length>500) fail(503,'Invalid Athbit URL configuration');
  }
  async function call(path,body,idempotencyKey) {
    ready();
    let r;
    // Accept the SOP's full platform base, and the earlier origin-only configuration.
    const root=baseUrl.replace(/\/+$/,'');
    const platform=root.endsWith('/hcgi/platform')?root:root+'/hcgi/platform';
    try {r=await fetchImpl(platform+'/v1/'+path,{
      method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{'x-api-key':apiKey,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });} catch {fail(502,'Athbit could not be reached. Retry with the same booking reference.');}
    if(!r.ok) fail(r.status===429?429:502,`Athbit request failed (${r.status}). Contact integration support; reuse the same booking reference.`);
    const result=await r.json().catch(()=>null);
    if(!result?.id || !Array.isArray(result.invitations)) fail(502,'Invalid Athbit response');
    return result;
  }
  return {enabled,
    async submit(booking) {
      const payload=structuredClone(booking.visaRequest);
      if(!Array.isArray(payload.mutamers)||!payload.mutamers.length||payload.mutamers.length>10) fail(400,'Athbit accepts 1–10 travelers');
      payload.groupInfo={...payload.groupInfo,otaRequestId:payload.groupInfo?.otaRequestId || booking.id};
      payload.return_url=returnUrl;
      payload.return_mode='after_submit';
      const ids=new Set();
      for(const a of payload.mutamers) {
        if(typeof a.birthDate!=='string' || !a.birthDate.trim() || typeof a.passportNumber!=='string' || !a.passportNumber.trim()) fail(400,'Each traveler requires birthDate and passportNumber');
        for(const field of ['birthDate','passportIssueDate','passportExpiryDate','iqamaExpiryDate']) {
          if(typeof a[field]==='string' && /^\d{4}-\d{2}-\d{2}T/.test(a[field])) a[field]=a[field].slice(0,10);
        }
        if(a.otaMutamerId==null || ids.has(String(a.otaMutamerId)) || !a.firstNameEn || !a.familyNameEn) fail(400,'Each traveler requires a unique ID and English first/family names');
        ids.add(String(a.otaMutamerId));
        if(a.grandfatherNameEn==null && a.grandFatherNameEn!=null) a.grandfatherNameEn=a.grandFatherNameEn;
        delete a.grandFatherNameEn;
      }
      if(Buffer.byteLength(JSON.stringify(payload))>15*1024*1024) fail(413,'Athbit request exceeds 15 MB');
      const result=await call('verification-requests',payload,booking.id);
      const returned=new Set();
      for(const i of result.invitations) {
        if(!i.id || !ids.has(String(i.otaMutamerId)) || returned.has(String(i.otaMutamerId))) fail(502,'Athbit invitation mapping mismatch');
        returned.add(String(i.otaMutamerId));
        let u; try{u=new URL(i.webUrl);}catch{fail(502,'Invalid Athbit invitation URL');}
        if(u.protocol!=='https:' || u.username || u.password) fail(502,'Invalid Athbit invitation URL');
      }
      if(returned.size!==ids.size) fail(502,'Missing Athbit invitations');
      for(const key of ['handoffUrl','groupUrl']) if(result[key]) {
        let u;try {u=new URL(result[key]);}catch {fail(502,'Invalid Athbit journey URL');}
        if(u.protocol!=='https:' || u.username || u.password || u.origin!==new URL(baseUrl).origin) fail(502,'Invalid Athbit journey URL');
      }
      return {...result,requestId:result.id,externalRequestId:result.requestId};
    },
    get: id=>call('verification-requests/'+encodeURIComponent(id)),
    verifyEvent(raw,headers,now=Date.now()) {
      ready();
      const ts=headers['x-athbit-timestamp'], signature=headers['x-athbit-signature'];
      if(!/^\d{13}$/.test(ts||'') || Math.abs(now-Number(ts))>300000 || !/^[a-f0-9]{64}$/i.test(signature||'') || !equal(signature.toLowerCase(),sign(ts+'.'+raw,webhookSecret))) fail(401,'Invalid Athbit event signature');
      let event;try{event=JSON.parse(raw);}catch{fail(400,'Invalid event JSON');}
      if(typeof event?.eventId!=='string' || !event.eventId || event.eventId.length>200 || event.eventId!==headers['x-athbit-event-id']) fail(400,'Athbit event ID mismatch');
      return event;
    },
    verifyReturn(params,now=Date.now()) {
      ready();
      for(const k of ['ref','result','ts','sig']) if(params.getAll(k).length!==1) fail(401,'Invalid return parameters');
      const ref=params.get('ref'),result=params.get('result'),ts=params.get('ts'),sig=params.get('sig');
      if(!ref || ref.length>200 || !['submitted','verified','review_required','unable_to_verify'].includes(result) || !/^\d{10}$/.test(ts||'') || Math.abs(now/1000-Number(ts))>600 || !/^[a-f0-9]{64}$/i.test(sig||'') || !equal(sig.toLowerCase(),sign(ref+'|'+result+'|'+ts,webhookSecret))) fail(401,'Invalid Athbit return signature');
      // A valid return never updates a booking decision. Webhooks remain authoritative.
      return {ref,result};
    }
  };
}

export function athbitVerification(booking,invite) {
  return invite.addedByPilgrim ? booking.companionVerifications?.[invite.id] : booking.verifications[invite.otaMutamerId];
}

export function applyAthbitEvent(booking,event) {
  if(event.requestId!==booking.utnRequestId) fail(400,'Athbit request mismatch');
  if(typeof event.invitationId!=='string' || !event.invitationId || event.invitationId.length>200) fail(400,'Invalid Athbit invitation ID');
  if(event.eventType==='mutamer.added_by_pilgrim') {
    if(!booking.invitations.some(i=>i.id===event.addedByInvitationId)) fail(503,'Athbit parent invitation not available yet');
    const existing=booking.invitations.find(i=>i.id===event.invitationId);
    if(existing) {
      if(!existing.addedByPilgrim || existing.addedByInvitationId!==event.addedByInvitationId) fail(400,'Athbit companion conflict');
      return {received:true,duplicate:true};
    }
    if(typeof event.fullNameEn!=='string' || !event.fullNameEn.trim()) fail(400,'Companion name required');
    booking.invitations.push({id:event.invitationId,addedByPilgrim:true,addedByInvitationId:event.addedByInvitationId,applicantName:event.fullNameEn.slice(0,300),relationship:String(event.relationship||'').slice(0,100),status:'pending'});
    return {received:true};
  }
  const invite=booking.invitations.find(i=>i.id===event.invitationId);
  // A decision may race the companion-added event; let Athbit retry it.
  if(!invite) fail(503,'Athbit invitation not available yet');
  if(!invite.addedByPilgrim && String(invite.otaMutamerId)!==String(event.otaMutamerId)) fail(400,'Athbit invitation mismatch');
  const old=athbitVerification(booking,invite);
  if(event.verification) {
    const v=event.verification;
    if(!['pending','verified','review_required','unverified'].includes(v.status)||!Number.isInteger(v.revision)||v.revision<1) fail(400,'Invalid Athbit decision');
    if(v.outcome!=null && !['verified','review_required','unverified'].includes(v.outcome)) fail(400,'Invalid Athbit outcome');
    if((old?.revision||0)>=v.revision) return {stale:true};
    const value={...v,certificate:v.status==='verified'?v.certificate:null,simulated:true,mode:'athbit_test'};
    if(invite.addedByPilgrim) {
      booking.companionVerifications ||= {};
      Object.defineProperty(booking.companionVerifications,invite.id,{value,writable:true,enumerable:true,configurable:true});
    } else booking.verifications[invite.otaMutamerId]=value;
    invite.action=null;
  } else {
    // Workflow signals (including case_result_issued) are not final decisions.
    const occurred=Date.parse(event.occurredAt);
    if(!Number.isFinite(occurred)) fail(400,'Invalid event time');
    if(occurred<=(invite.lastWorkflowAt||0)) return {stale:true};
    invite.lastWorkflowAt=occurred;
    invite.action={eventType:event.eventType,actionType:event.actionType||null,messageAr:String(event.messageAr||'').slice(0,4000),messageEn:String(event.messageEn||'').slice(0,4000)};
  }
  const statuses=booking.invitations.map(i=>athbitVerification(booking,i)?.status||'pending');
  booking.status=statuses.includes('unverified')?'unverified':statuses.includes('review_required')?'review_required':statuses.includes('verified')?'verified':'pending_verification';
  return {received:true};
}
