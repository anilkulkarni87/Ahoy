import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';
const {db,init,campaigns,seed}=await import('../lib/db.mjs');
const {processComment}=await import('../lib/engine.mjs');
await init();
const campaign={name:'Test guide',active:true,triggerType:'specific',mediaId:'post',keywords:['GUIDE'],matchMode:'contains',ignoreCase:true,dmTemplate:'Hey {username}',linkUrl:''};
for(const tenant of ['alice','bob']) await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:[tenant+'-campaign',tenant,JSON.stringify(campaign)]});
test('tenant queries never return another workspace campaign',async()=>{assert.deepEqual((await campaigns('alice')).map(c=>c.id),['alice-campaign']);assert.deepEqual((await campaigns('bob')).map(c=>c.id),['bob-campaign']);});
test('a duplicate event cannot send a second message',async()=>{const input={commentId:'comment-1',username:'maya',text:'GUIDE please',mediaId:'post'};const first=await processComment('alice',input,true);const duplicate=await processComment('alice',input,true);assert.equal(first.status,'sent');assert.equal(first.message,'Hey maya');assert.equal(duplicate.duplicate,true);const count=await db().execute("SELECT count(*) AS count FROM activity WHERE tenant='alice' AND comment_id='comment-1'");assert.equal(Number(count.rows[0].count),1);});
test('the same comment id is independent across tenants',async()=>{const result=await processComment('bob',{commentId:'comment-1',username:'maya',text:'GUIDE',mediaId:'post'},true);assert.equal(result.status,'sent');assert.ok(!result.duplicate);});
test('opt-out suppresses future matches on the same account',async()=>{await processComment('alice',{commentId:'stop',username:'no-thanks',text:'STOP',mediaId:'post'},true);const result=await processComment('alice',{commentId:'after-stop',username:'no-thanks',text:'GUIDE',mediaId:'post'},true);assert.equal(result.status,'skipped');assert.equal(result.reason,'This person opted out.');});
test('unmatched comments and other posts are skipped',async()=>{const result=await processComment('alice',{commentId:'wrong-post',username:'sam',text:'GUIDE',mediaId:'other-post'},true);assert.equal(result.status,'skipped');});
test('demo seeding returns database ids matching activity references',async()=>{await seed('demo-test');const list=await campaigns('demo-test');assert.equal(list.length,3);assert.ok(list.every(c=>c.id.startsWith('demo-test:')));await seed('demo-test');assert.equal((await campaigns('demo-test')).length,3);});
test('stable user ids preserve opt-outs across username changes',async()=>{await processComment('alice',{commentId:'id-stop',username:'old-name',userId:'123',text:'STOP',mediaId:'post'},true);const result=await processComment('alice',{commentId:'id-again',username:'new-name',userId:'123',text:'GUIDE',mediaId:'post'},true);assert.equal(result.status,'skipped');assert.equal(result.reason,'This person opted out.');});
test('daily rollups are idempotent and retain current activity',async()=>{const {rollupAndPurge}=await import('../lib/retention.mjs');await db().execute("INSERT INTO activity(id,tenant,campaign_id,comment_id,username,comment,status,created_at) VALUES('old','retention','c','old-comment','maya','GUIDE','sent','2025-01-01T10:00:00Z')");await rollupAndPurge();await rollupAndPurge();const stats=(await db().execute("SELECT * FROM daily_stats WHERE tenant='retention'")).rows;assert.equal(stats.length,1);assert.equal(Number(stats[0].comments),1);assert.equal(Number(stats[0].sent),1);assert.equal((await db().execute("SELECT * FROM activity WHERE id='old'")).rows.length,0);assert.ok((await db().execute("SELECT * FROM activity WHERE tenant='alice'")).rows.length>0);});
test('account deletion erases its data without touching other workspaces',async()=>{const {deleteAccountData}=await import('../lib/retention.mjs');await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['delete-me','erase',JSON.stringify({...campaign,accountId:'ig-account'})]});await db().execute("INSERT INTO links(id,tenant,campaign_id,url) VALUES('old-link','erase','delete-me','https://example.com')");await db().execute("INSERT INTO accounts(id,tenant,username,token) VALUES('ig-account','erase','maya','encrypted')");await processComment('erase',{commentId:'erase-comment',username:'sam',text:'GUIDE',mediaId:'post',accountId:'ig-account'},true);await deleteAccountData('erase','ig-account');for(const table of ['campaigns','links','accounts','activity'])assert.equal((await db().execute(`SELECT * FROM ${table} WHERE tenant='erase'`)).rows.length,0);assert.equal((await campaigns('bob')).length,1);});
test('campaigns send original URLs by default without creating tracking records',async()=>{
 for(const setting of [undefined,false]) {
  const tenant=setting===false?'direct-off':'direct-legacy';
  await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:[tenant+'-campaign',tenant,JSON.stringify({...campaign,linkUrl:'https://destination.example/resource?source=instagram',...(setting===undefined?{}:{trackClicks:setting})})]});
  const r=await processComment(tenant,{commentId:'direct',username:'maya',text:'GUIDE',mediaId:'post'},true);
  assert.equal(r.message,'Hey maya\nhttps://destination.example/resource?source=instagram');
  assert.equal((await db().execute({sql:'SELECT count(*) AS n FROM links WHERE tenant=?',args:[tenant]})).rows[0].n,0);
 }
});
test('explicit click tracking creates a redirect mapped to the exact original URL',async()=>{
 process.env.APP_URL='https://ahoy.example/';
 await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['tracked-campaign','tracked',JSON.stringify({...campaign,linkUrl:'https://destination.example/resource?source=instagram',trackClicks:true})]});
 const r=await processComment('tracked',{commentId:'tracked',username:'maya',text:'GUIDE',mediaId:'post'},true);
 const row=(await db().execute("SELECT * FROM links WHERE tenant='tracked'")).rows[0];
 assert.equal(row.url,'https://destination.example/resource?source=instagram');assert.equal(r.message,'Hey maya\nhttps://ahoy.example/api/go/'+row.id);
});
test('retention removes old follow-request resource snapshots with activity',async()=>{
 const {rollupAndPurge}=await import('../lib/retention.mjs');
 await db().execute("INSERT INTO activity(id,tenant,comment_id,username,comment,status,created_at) VALUES('old-follow','retention-follow','old-follow','maya','GUIDE','awaiting-follow','2025-01-01T10:00:00Z')");
 await db().execute("INSERT INTO follow_requests(activity_id,tenant,account_id,user_id,resource_message,profile_url) VALUES('old-follow','retention-follow','ig','user','secret','https://www.instagram.com/studio/')");
 await rollupAndPurge();assert.equal((await db().execute("SELECT * FROM follow_requests WHERE activity_id='old-follow'")).rows.length,0);
});
