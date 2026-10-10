import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFailure } from '../server/ai-errors.mjs';

test('provider errors distinguish image, quota, throttle and credentials without leaking payloads',async()=>{
  const cases=[
    [429,'insufficient_quota',503,'ACCOUNT_LIMIT'],
    [429,'rate_limit_exceeded',429,'RATE_LIMITED'],
    [400,'invalid_image_format',422,'INVALID_IMAGE'],
    [401,'invalid_api_key',503,'CONFIGURATION'],
    [503,'server_is_overloaded',503,'PROVIDER_UNAVAILABLE'],
    [400,'invalid_json_schema',502,'REQUEST_FAILED'],
  ];
  for(const [status,code,expected,reason] of cases) {
    const result=await aiFailure(new Response(JSON.stringify({error:{code,message:'PRIVATE_DOCUMENT_AND_KEY'}}),{status}));
    assert.equal(result.status,expected);
    assert.ok(result.message.includes('AI_'+reason));
    assert.ok(!result.message.includes('PRIVATE_DOCUMENT_AND_KEY'));
  }
  const unknown=await aiFailure(new Response('not json',{status:502}));
  assert.equal(unknown.status,503);
});
