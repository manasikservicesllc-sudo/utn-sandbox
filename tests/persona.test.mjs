import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersona,personaResult} from '../server/persona.mjs';
test('Persona production keys cannot enable the sandbox adapter',()=>{
  assert.equal(createPersona({key:'persona_production_example',template:'itmpl_abc'}).available,false);
  assert.equal(createPersona({key:'persona_sandbox_example'}).available,false);
});
test('completion alone and missing/unrelated verifications never produce approval',()=>{
  const r={data:{attributes:{status:'completed'},relationships:{verifications:{data:[]}}}};
  assert.equal(personaResult(r).status,'pending');
  r.data.attributes.status='approved';
  r.included=[{id:'unrelated',type:'verification/selfie',attributes:{status:'passed'}}];
  assert.equal(personaResult(r).status,'unverified');
  for(const status of ['declined','expired','failed']) {r.data.attributes.status=status;assert.equal(personaResult(r).status,'unverified');}
});

test('new inquiries without a session token are resumed before opening the SDK',async()=>{
  const calls=[];
  const provider=createPersona({key:'persona_sandbox_test',template:'itmpl_test',fetchImpl:async(url)=>{
    calls.push(url);
    return new Response(JSON.stringify({data:{id:'inq_test'},...(url.endsWith('/resume')?{meta:{'session-token':'scoped-session'}}:{})}));
  }});
  const session=await provider.start({id:'invite-test'});
  assert.equal(session.sessionToken,'scoped-session');
  assert.equal(calls.length,2);
  assert.ok(calls[1].endsWith('/inquiries/inq_test/resume'));
});
