import { fail } from './shared.mjs';

export function createPersona({key,template,fetchImpl=fetch}={}) {
  // This adapter is intentionally sandbox-only. Production requires a separate
  // rollout and reviewed template/check policy, not a client-selected flag.
  const available=!!key?.startsWith('persona_sandbox_') && /^itmpl_[A-Za-z0-9]+$/.test(template || '');
  async function call(path,method='GET',value,idempotency) {
    if(!available) fail(503,'Persona Sandbox is awaiting its configured KYC template.');
    let response;
    try { response=await fetchImpl('https://api.withpersona.com/api/v1'+path,{
      method,headers:{Authorization:'Bearer '+key,'Persona-Version':'2025-12-08','Content-Type':'application/json',...(idempotency?{'Idempotency-Key':idempotency}:{})},
      ...(value?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(25000)
    }); } catch { fail(502,'Persona could not be reached. Please retry.'); }
    if(!response.ok) fail(502,`Persona request failed (${response.status}). Check the server key permissions and template configuration.`);
    return response.json();
  }
  return {available,
    async start(i) {
      const ref=i.id+':'+(i.personaGeneration||0);
      const created=i.persona?.id ? await call('/inquiries/'+encodeURIComponent(i.persona.id)+'/resume','POST',{})
        : await call('/inquiries','POST',{data:{attributes:{'inquiry-template-id':template,'reference-id':ref}}},'utn-persona-'+ref);
      if(!/^inq_[A-Za-z0-9]+$/.test(created.data?.id || '') || !created.meta?.['session-token']) fail(502,'Persona did not provide a resumable session.');
      return {id:created.data.id,sessionToken:created.meta['session-token']};
    },
    async result(id) {
      const response=await call('/inquiries/'+encodeURIComponent(id)+'?include=verifications');
      if(response.data?.id!==id) fail(502,'Persona inquiry mismatch.');
      return personaResult(response);
    }
  };
}

export function personaResult(response) {
  const state=response.data?.attributes?.status;
  if(!['approved','declined','failed','expired'].includes(state)) return {status:'pending',providerStatus:state || 'unknown',mode:'persona',simulated:true};
  const ids=new Set((response.data.relationships?.verifications?.data||[]).map(x=>x.id));
  const verifications=(response.included||[]).filter(x=>ids.has(x.id));
  const passed=type=>verifications.some(x=>x.type===type && x.attributes?.status==='passed');
  const document=passed('verification/government-id'), selfie=passed('verification/selfie');
  const verified=state==='approved' && document && selfie;
  return {status:verified?'verified':'unverified',outcome:verified?'verified':'unverified',providerStatus:state,mode:'persona',simulated:true,
    verificationLevel:'persona_sandbox',scope:'Persona Sandbox simulation. No real document authenticity, face matching or liveness decision.',
    capabilities:{dataExtraction:'simulated',dataComparison:'not_performed',issuerAuthentication:'not_performed',faceMatch:'simulated',liveness:'simulated'},
    checks:[{id:'persona_document',label:'Persona document check (simulated)',passed:document},{id:'persona_selfie',label:'Persona selfie check (simulated)',passed:selfie}],
    concerns:verified?[]:['Persona Sandbox did not return approval with passed document and selfie checks.']};
}
