import test from 'node:test';import assert from 'node:assert/strict';
import {readLimitedText} from '../lib/request.mjs';import {sameOrigin} from '../lib/auth.mjs';
test('body limit enforces bytes without content length and preserves signed UTF8 text',async()=>{
 assert.equal(await readLimitedText(new Request('https://example.com',{method:'POST',body:'🌿'}),4),'🌿');
 await assert.rejects(readLimitedText(new Request('https://example.com',{method:'POST',body:'🌿'}),3),e=>e.status===413);
 await assert.rejects(readLimitedText(new Request('https://example.com',{method:'POST',body:'x',headers:{'content-length':'100'}}),4),e=>e.status===413);
});
test('cross-site browser requests are blocked even without Origin',()=>{
 assert.equal(sameOrigin(new Request('https://example.com',{headers:{'sec-fetch-site':'cross-site'}})),false);
});
test('persistent request limits enforce boundaries, isolate scopes and expire',async()=>{
 process.env.DATABASE_URL='file::memory:';
 const {rateLimit}=await import('../lib/rate-limit.mjs');
 const req=new Request('https://example.com',{headers:{'x-forwarded-for':'192.0.2.1'}});
 await rateLimit(req,'test',1,1000,1000);
 await assert.rejects(rateLimit(req,'test',1,1000,1001),e=>e.status===429);
 await rateLimit(req,'other',1,1000,1001);
 await rateLimit(req,'test',1,1000,2000);
});
