import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';
process.env.ENCRYPTION_KEY='c'.repeat(64);
process.env.META_API_VERSION='v99.0'; // All network calls in this file are mocked.
const {db,init}=await import('../lib/db.mjs');
const {encrypt}=await import('../lib/core.mjs');
const {processComment,deliver}=await import('../lib/engine.mjs');
await init();
await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['campaign','owner',JSON.stringify({name:'Guide',active:true,triggerType:'any',keywords:['GUIDE'],dmTemplate:'Hello {username}',matchMode:'contains',accountId:'ig'})]});
await db().execute({sql:'INSERT INTO accounts(id,tenant,username,token) VALUES(?,?,?,?)',args:['ig','owner','studio',encrypt('test-token')]});
const input=id=>({commentId:id,username:'maya',userId:'123',text:'GUIDE',accountId:'ig'});
test('live sends remain off until explicitly enabled',async()=>{const r=await processComment('owner',input('off'));await deliver(r.id);assert.equal((await db().execute({sql:'SELECT status FROM activity WHERE id=?',args:[r.id]})).rows[0].status,'failed');});
test('rate limits preserve the delivery for a retry, without duplicating success',async()=>{process.env.LIVE_SENDS_ENABLED='true';const r=await processComment('owner',input('retry'));let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:4,message:'Rate limit'}}),{status:429});};await assert.rejects(()=>deliver(r.id));assert.equal((await db().execute({sql:'SELECT status FROM activity WHERE id=?',args:[r.id]})).rows[0].status,'rate-limited');global.fetch=async()=>{calls++;return new Response(JSON.stringify({message_id:'accepted'}),{status:200});};assert.equal((await deliver(r.id)).sent,true);await deliver(r.id);assert.equal(calls,2);});
test('overlapping delivery attempts make exactly one API request',async()=>{const r=await processComment('owner',input('concurrent'));let calls=0;global.fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return new Response(JSON.stringify({message_id:'ok'}),{status:200});};await Promise.all([deliver(r.id),deliver(r.id)]);assert.equal(calls,1);});
test('unknown delivery outcomes fail visibly and do not auto-resend',async()=>{const r=await processComment('owner',input('timeout'));let calls=0;global.fetch=async()=>{calls++;throw new Error('Connection reset');};const result=await deliver(r.id);assert.equal(result.status,'failed');assert.match(result.reason,/could not be confirmed/);await deliver(r.id);assert.equal(calls,1);});
test('Unified private and public replies use the persisted Facebook Graph connection',async()=>{
 await db().execute("UPDATE accounts SET auth_type='unified' WHERE id='ig'");
 const campaign=JSON.parse((await db().execute("SELECT data FROM campaigns WHERE id='campaign'")).rows[0].data);campaign.publicReply='Sent!';
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'campaign']});
 const calls=[];global.fetch=async url=>{calls.push(new URL(url));return new Response(JSON.stringify({message_id:'ok'}));};
 const r=await processComment('owner',input('unified'));assert.equal((await deliver(r.id)).sent,true);
 assert.equal(calls.length,2);assert.ok(calls.every(u=>u.host==='graph.facebook.com'));assert.ok(calls[0].pathname.endsWith('/ig/messages'));assert.ok(calls[1].pathname.endsWith('/unified/replies'));
});
