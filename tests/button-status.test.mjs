import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';process.env.META_APP_ID='123';process.env.ENCRYPTION_KEY='a'.repeat(64);
const {encrypt}=await import('../lib/core.mjs');const {db}=await import('../lib/db.mjs');
const {checkButtonStatus}=await import('../lib/button-status.mjs');
const a={id:'ig',token:encrypt('private'),auth_type:'unified'};
test('only the current app with all required fields is enabled and persists',async()=>{
 const ok=await checkButtonStatus('owner',a,false,async()=>({data:[{id:'123',subscribed_fields:['comments','messages','messaging_postbacks']}]}));
 assert.equal(ok.status,'enabled');assert.equal((await db().execute("SELECT status FROM account_button_status WHERE tenant='owner'")).rows[0].status,'enabled');
 const missing=await checkButtonStatus('owner',a,false,async()=>({data:[{id:'other',subscribed_fields:['comments','messages','messaging_postbacks']}]}));assert.equal(missing.status,'not-enabled');
 const unknown=await checkButtonStatus('owner',a,false,async()=>{throw Error('secret-provider-detail');});assert.equal(unknown.status,'unknown');assert.ok(!JSON.stringify(unknown).includes('secret-provider-detail'));
});
test('enable is read back instead of trusting success alone',async()=>{
 const calls=[];const result=await checkButtonStatus('owner',a,true,async(path,token,options)=>{calls.push(options);return options.method==='POST'?{success:true}:{data:[]};});
 assert.equal(calls.length,2);assert.equal(result.status,'not-enabled');
});
