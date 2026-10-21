import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAthbit,applyAthbitEvent} from '../server/athbit.mjs';
import {startServices} from '../server/services.mjs';
import {sign} from '../server/shared.mjs';
const config={baseUrl:'https://athbit.example',apiKey:'athbit_test_'+'a'.repeat(32),webhookSecret:'test-secret',returnUrl:'https://ota.example/api/athbit/return'};
const input={serviceId:'utn',visaRequest:{groupInfo:{otaRequestId:'CLIENT-1'},package:{},mutamers:[{otaMutamerId:1,firstNameEn:'Demo',familyNameEn:'One',grandFatherNameEn:'Grand',birthDate:'1990-05-12',passportNumber:'DEMO1234'}]}};
const response={id:'REQ-1',requestId:'CLIENT-1',invitations:[{id:'INV-1',otaMutamerId:1,webUrl:'https://athbit.example/apply/example',status:'pending'}]};
const event=(revision=1)=>({eventId:'evt_'+revision,eventType:'decision_approved',requestId:'REQ-1',invitationId:'INV-1',otaMutamerId:1,occurredAt:new Date().toISOString(),verification:{status:'verified',revision,certificate:{id:'CERT-1'}}});
function headers(raw){const ts=String(Date.now());return {'Content-Type':'application/json','x-athbit-timestamp':ts,'x-athbit-event-id':JSON.parse(raw).eventId,'x-athbit-signature':sign(ts+'.'+raw,config.webhookSecret)};}

test('Athbit sends direct ministry payload and maps remote ID without exposing the key',async()=>{
  const client=createAthbit({...config,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://athbit.example/hcgi/platform/v1/verification-requests');
    assert.equal(options.headers['Idempotency-Key'],'OTA-12345678');
    assert.equal(options.headers['x-api-key'],config.apiKey);
    assert.equal(options.redirect,'manual');
    const payload=JSON.parse(options.body);
    assert.equal(payload.return_url,config.returnUrl);
    assert.equal(payload.return_mode,'after_submit');
    assert.equal(payload.mutamers[0].grandfatherNameEn,'Grand');
    assert.equal(payload.mutamers[0].grandFatherNameEn,undefined);
    assert.equal(payload.visaRequest,undefined);
    return Response.json(response,{status:201});
  }});
  const result=await client.submit({...input,id:'OTA-12345678'});
  assert.equal(result.requestId,'REQ-1');
  assert.equal(result.externalRequestId,'CLIENT-1');
  assert.equal(input.visaRequest.mutamers[0].grandFatherNameEn,'Grand');
  await assert.rejects(createAthbit({...config,apiKey:'athbit_live_'+'a'.repeat(32)}).submit({...input,id:'OTA-12345678'}),/test key/);
});

test('Athbit checks raw body signatures, age, header ID and signed returns',()=>{
  const client=createAthbit(config),raw=JSON.stringify(event()),h=headers(raw);
  assert.equal(client.verifyEvent(raw,h).eventId,'evt_1');
  assert.throws(()=>client.verifyEvent(raw+' ',h),/signature/);
  assert.throws(()=>client.verifyEvent(raw,{...h,'x-athbit-signature':'x'}),/signature/);
  assert.throws(()=>client.verifyEvent(raw,h,Date.now()+310000),/signature/);
  assert.throws(()=>client.verifyEvent(raw,{...h,'x-athbit-event-id':'different'}),/mismatch/);
  const ts=String(Math.floor(Date.now()/1000)),q=new URLSearchParams({ref:'REF',result:'verified',ts,sig:sign('REF|verified|'+ts,config.webhookSecret)});
  assert.equal(client.verifyReturn(q).result,'verified');
  q.set('result','unable_to_verify');assert.throws(()=>client.verifyReturn(q),/signature/);
  q.set('result','submitted');q.set('sig',sign('REF|submitted|'+ts,config.webhookSecret));
  assert.equal(client.verifyReturn(q).result,'submitted');
  q.set('result','review_required');q.set('sig',sign('REF|review_required|'+ts,config.webhookSecret));
  assert.equal(client.verifyReturn(q).result,'review_required');
});

test('Missing birth date or passport in any traveler rejects the whole request before sending',async()=>{
  let calls=0;const client=createAthbit({...config,fetchImpl:async()=>{calls++;return Response.json(response);}});
  for(const field of ['birthDate','passportNumber']) {
    const booking=structuredClone({...input,id:'OTA-12345678'});
    const second={...booking.visaRequest.mutamers[0],otaMutamerId:2};delete second[field];
    booking.visaRequest.mutamers.push(second);
    await assert.rejects(client.submit(booking),/requires birthDate and passportNumber/);
  }
  assert.equal(calls,0);
});

test('Companions are isolated by invitation ID; review has no certificate and correct aggregate priority',()=>{
  const b={utnRequestId:'REQ-1',invitations:structuredClone(response.invitations),verifications:{}};
  applyAthbitEvent(b,event(1));
  const add={eventType:'mutamer.added_by_pilgrim',requestId:'REQ-1',invitationId:'COMP-1',addedByInvitationId:'INV-1',fullNameEn:'DEMO COMPANION',relationship:'wife'};
  applyAthbitEvent(b,add);applyAthbitEvent(b,add);
  applyAthbitEvent(b,{...add,invitationId:'COMP-2'});
  assert.equal(b.invitations.length,3);
  assert.equal(b.invitations[1].otaMutamerId,undefined);
  const decision={...event(2),invitationId:'COMP-1',otaMutamerId:undefined,verification:{status:'review_required',outcome:'review_required',revision:2,certificate:null}};
  applyAthbitEvent(b,decision);
  assert.equal(b.status,'review_required');assert.equal(b.companionVerifications['COMP-1'].certificate,null);
  assert.equal(b.companionVerifications['COMP-2'],undefined);assert.equal(b.verifications[1].status,'verified');
  applyAthbitEvent(b,{...decision,invitationId:'COMP-2',verification:{status:'unverified',revision:1,certificate:{id:'INVALID'}}});
  assert.equal(b.status,'unverified');assert.equal(b.companionVerifications['COMP-2'].certificate,null);
  assert.throws(()=>applyAthbitEvent(b,{...decision,invitationId:'NOT-YET-ADDED'}),/not available yet/);
  assert.throws(()=>applyAthbitEvent(b,{...add,requestId:'REQ-OTHER'}),/request mismatch/);
});

test('SOP platform base is not duplicated and journey links stay on provider origin',async()=>{
  const client=createAthbit({...config,baseUrl:config.baseUrl+'/hcgi/platform/',fetchImpl:async url=>{
    assert.equal(url,'https://athbit.example/hcgi/platform/v1/verification-requests');
    return Response.json({...response,groupUrl:'https://athbit.example/apply/group/test'});
  }});
  assert.equal((await client.submit({...input,id:'OTA-12345678'})).groupUrl,'https://athbit.example/apply/group/test');
  const invalid=createAthbit({...config,fetchImpl:async()=>Response.json({...response,groupUrl:'https://other.example/group'})});
  await assert.rejects(invalid.submit({...input,id:'OTA-12345678'}),/journey URL/);
});

test('Athbit workflow signals do not approve, and old revisions cannot restore revoked certificates',()=>{
  const b={utnRequestId:'REQ-1',invitations:structuredClone(response.invitations),verifications:{}};
  applyAthbitEvent(b,{...event(),verification:undefined,eventType:'case_result_issued',result:'verified'});
  assert.equal(b.status,'pending_verification');
  applyAthbitEvent(b,{...event(),verification:undefined,eventType:'case_submitted',occurredAt:new Date(Date.now()+1000).toISOString()});
  assert.equal(b.status,'pending_verification');
  applyAthbitEvent(b,event(2));assert.equal(b.status,'verified');
  applyAthbitEvent(b,{...event(3),verification:{status:'unverified',revision:3,certificate:null}});
  assert.equal(applyAthbitEvent(b,event(2)).stale,true);
  assert.equal(b.status,'unverified');assert.equal(b.verifications[1].certificate,null);
});

test('OTA round trip with Athbit fixture preserves webhook result and ignores duplicate delivery',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'athbit-'));
  const s=await startServices({dataDir:dir,otaPort:0,utnPort:0,athbitEnabled:true,apiKey:'',athbit:{...config,fetchImpl:async()=>Response.json(response,{status:201})}});
  t.after(async()=>{await s.close();await rm(dir,{recursive:true,force:true});});
  let r=await fetch(s.otaUrl+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'fixture-request-1'},body:JSON.stringify(input)});
  assert.equal(r.status,201);const b=await r.json();assert.equal(b.utnRequestId,'REQ-1');assert.equal(b.provider,'athbit');
  const raw=JSON.stringify(event());
  r=await fetch(s.otaUrl+'/api/webhooks/athbit',{method:'POST',headers:headers(raw),body:raw});assert.equal(r.status,200);
  r=await fetch(s.otaUrl+'/api/webhooks/athbit',{method:'POST',headers:headers(raw),body:raw});assert.equal((await r.json()).duplicate,true);
  r=await fetch(s.otaUrl+'/api/bookings/'+b.id,{headers:{Authorization:'Bearer '+b.accessToken}});
  const updated=await r.json();assert.equal(updated.invitations[0].status,'verified');assert.equal(updated.verifications[1].simulated,true);
  const add=JSON.stringify({eventId:'evt_companion',eventType:'mutamer.added_by_pilgrim',requestId:'REQ-1',invitationId:'COMP-HTTP',addedByInvitationId:'INV-1',fullNameEn:'DEMO COMPANION',relationship:'wife'});
  r=await fetch(s.otaUrl+'/api/webhooks/athbit',{method:'POST',headers:headers(add),body:add});assert.equal(r.status,200);
  r=await fetch(s.otaUrl+'/api/webhooks/athbit',{method:'POST',headers:headers(add),body:add});assert.equal((await r.json()).duplicate,true);
  const review=JSON.stringify({...event(2),eventId:'evt_review',invitationId:'COMP-HTTP',otaMutamerId:undefined,verification:{status:'review_required',outcome:'review_required',revision:2,certificate:null}});
  r=await fetch(s.otaUrl+'/api/webhooks/athbit',{method:'POST',headers:headers(review),body:review});assert.equal(r.status,200);
  r=await fetch(s.otaUrl+'/api/bookings/'+b.id,{headers:{Authorization:'Bearer '+b.accessToken}});
  const reviewed=await r.json();assert.equal(reviewed.status,'review_required');
  const companion=reviewed.invitations.find(i=>i.id==='COMP-HTTP');
  assert.equal(companion.applicantName,'DEMO COMPANION');assert.equal(companion.status,'review_required');assert.equal(companion.certificate,null);
});
