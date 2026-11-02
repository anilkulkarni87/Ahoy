import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';process.env.ENCRYPTION_KEY='f'.repeat(64);process.env.META_API_VERSION='v99.0';process.env.LIVE_SENDS_ENABLED='true';
const {db,init}=await import('../lib/db.mjs');const {encrypt}=await import('../lib/core.mjs');
const {processComment,deliver}=await import('../lib/engine.mjs');const {followChecks,checkFollow}=await import('../lib/follow.mjs');
const {conversionReport,connectionHealth}=await import('../lib/insights.mjs');const {observeWebhook,activityTimeline,signal}=await import('../lib/observability.mjs');
await init();
const base={name:'My guide',active:true,accountId:'ig',triggerType:'any',keywords:['guide'],ignoreCase:true,matchMode:'contains',dmTemplate:'Resource',deliveryMode:'after-follow'};
await db().execute({sql:'INSERT INTO accounts(id,tenant,username,token,auth_type) VALUES(?,?,?,?,?)',args:['ig','owner','private.creator',encrypt('private-token'),'unified']});
await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['c','owner',JSON.stringify(base)]});
const input=(commentId,userId='person')=>({commentId,userId,username:userId,text:'guide',accountId:'ig'});
const metric=async id=>(await db().execute({sql:'SELECT * FROM delivery_metrics WHERE activity_id=?',args:[id]})).rows[0];
const campaign=async()=> (await conversionReport('owner')).campaigns.find(c=>c.mode==='after-follow');
let requestId;
test('full gated delivery records true milestones, deduplicates clicks and keeps timeline tenant scoped',async()=>{
 const r=await processComment('owner',input('first'));requestId=r.id;
 global.fetch=async()=>Response.json({recipient_id:'recipient',message_id:'request'});
 await deliver(r.id);const m=await metric(r.id);assert.ok(m.request_at);assert.equal(m.resource_at,null);assert.equal(m.verified_at,null);
 const item={sender:{id:'recipient'},timestamp:Date.now(),message:{text:'CHECK',mid:'check',quick_reply:{payload:'ahoy:follow:'+r.id}}};
 const [check]=await followChecks('ig',item);await followChecks('ig',item);
 global.fetch=async(url,options)=>Response.json(options.method==='POST'?{message_id:'resource'}:{is_user_follow_business:true});
 await checkFollow(check);await checkFollow(check);
 const row=await metric(r.id);for(const field of ['request_at','check_at','verified_at','resource_at'])assert.ok(row[field]);
 const report=await campaign();assert.equal(report.matched,1);assert.equal(report.checked,1);assert.equal(report.verified,1);assert.equal(report.accepted,1);
 const timeline=await activityTimeline('owner',r.id);assert.equal(timeline.completeHistory,true);assert.equal(timeline.events.filter(e=>e.stage==='check').length,1);assert.ok(timeline.events.some(e=>e.stage==='resource'));assert.equal(await activityTimeline('another',r.id),null);
});
test('repeat comments by one person count one audience member and preserve delivery mode snapshot',async()=>{
 const second=await processComment('owner',input('second'));
 await processComment('owner',input('second'));
 let report=await campaign();assert.equal(report.matched,1);assert.equal(report.replies,2);
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify({...base,deliveryMode:'immediate'}),'c']});
 const instant=await processComment('owner',input('instant'));
 global.fetch=async()=>Response.json({message_id:'instant'});await deliver(instant.id);
 const groups=(await conversionReport('owner')).campaigns;assert.equal(groups.length,2);assert.equal(groups.find(c=>c.mode==='after-follow').replies,2);assert.equal(groups.find(c=>c.mode==='immediate').accepted,1);
 assert.equal((await metric(second.id)).gated,1);
});
test('unknown sends and denied follow checks never count as acceptance or verification',async()=>{
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(base),'c']});
 const r=await processComment('owner',input('denied','different-person'));
 global.fetch=async()=>Response.json({recipient_id:'different-recipient',message_id:'request'});await deliver(r.id);
 const [check]=await followChecks('ig',{sender:{id:'different-recipient'},timestamp:Date.now(),message:{text:'CHECK '+r.id.slice(0,8),mid:'denied'}});
 global.fetch=async(url,options)=>Response.json(options.method==='POST'?{message_id:'buttons'}:{is_user_follow_business:false});
 await checkFollow(check);assert.equal((await metric(r.id)).verified_at,null);assert.equal((await metric(r.id)).resource_at,null);
 const unknown=await processComment('owner',input('unknown','unknown-person'));global.fetch=async()=>{throw Error('secret-upstream-detail');};await deliver(unknown.id);
 const m=await metric(unknown.id);assert.equal(m.request_at,null);assert.equal(m.resource_at,null);assert.equal(m.failure_code,'unknown-outcome');
 const report=await conversionReport('owner');assert.ok(report.problems.some(p=>p.code==='unknown-outcome'));assert.ok(!JSON.stringify(report).includes('secret-upstream-detail'));
});
test('health reports real observations, a quiet account stays unverified and diagnostics are safe',async()=>{
 const empty=await connectionHealth('owner');assert.equal(empty.accounts[0].signals.comment,undefined);
 await observeWebhook({entry:[{id:'unowned',changes:[{field:'comments'}]},{id:'ig',changes:[{field:'comments'}],messaging:[{postback:{payload:'ahoy:follow:'+requestId}}]}]});
 await signal('owner','ig','access','failed');
 const health=await connectionHealth('owner');assert.ok(health.accounts[0].signals.comment);assert.ok(health.accounts[0].signals.button);assert.equal(health.accounts[0].nextAction.view,'accounts');
 const safe=JSON.stringify(health.safeSummary);for(const privateValue of ['private.creator','private-token','different-person','Resource','request_id'])assert.ok(!safe.includes(privateValue));
 assert.equal((await db().execute("SELECT count(*) AS n FROM connection_signals WHERE account_id='unowned'")).rows[0].n,0);
 assert.equal((await connectionHealth('another')).accounts.length,0);
});
test('cohort periods and launch boundary exclude test metrics without deleting them',async()=>{
 const now=Date.now();const before=new Date(now-3*86400000).toISOString();const launch=new Date(now-86400000).toISOString();
 await db().execute({sql:'UPDATE delivery_metrics SET created_at=? WHERE activity_id=?',args:[before,requestId]});
 await db().execute({sql:'INSERT INTO workspace_settings(tenant,analytics_since) VALUES(?,?)',args:['owner',launch]});
 const report=await conversionReport('owner',{period:'30',now});assert.equal(report.since,launch);assert.equal(report.campaigns.find(c=>c.mode==='after-follow').accepted,0);assert.ok(await metric(requestId));
 await assert.rejects(conversionReport('owner',{period:'invalid'}),/Choose/);
 const absent=await conversionReport('owner',{campaignId:'not-owned'});assert.equal(absent.campaigns.length,0);
});
test('legacy activity is explicit unknown history and is not fabricated into funnel milestones',async()=>{
 await db().execute("INSERT INTO activity(id,tenant,campaign_id,comment_id,username,comment,status) VALUES('legacy','legacy','old','old','someone','private message','sent')");
 const timeline=await activityTimeline('legacy','legacy');assert.equal(timeline.completeHistory,false);assert.equal(timeline.events.length,0);
 const report=await conversionReport('legacy');assert.equal(report.campaigns.length,0);assert.equal(report.untrackedActivity,1);
});
test('old concurrent health writes do not overwrite newer evidence',async()=>{
 const latest=new Date(Date.now()+1000).toISOString();
 await signal('owner','ig','access','failed',latest);
 await signal('owner','ig','access','ok',new Date(Date.now()-1000).toISOString());
 const row=(await db().execute("SELECT status,checked_at FROM connection_signals WHERE tenant='owner' AND account_id='ig' AND kind='access'")).rows[0];assert.equal(row.status,'failed');assert.equal(row.checked_at,latest);
});
test('stale queues give recovery instructions while quiet accounts remain unverified',async()=>{
 await db().execute("INSERT INTO accounts(id,tenant,username,token) VALUES('quiet','health-only','quiet','unused')");
 const quiet=await connectionHealth('health-only');assert.equal(quiet.accounts[0].expired,false);assert.equal(quiet.accounts[0].delayed,false);assert.match(quiet.accounts[0].nextAction.message,/not a fault/);
 await db().execute("INSERT INTO activity(id,tenant,account_id,comment_id,username,comment,status,created_at) VALUES('stalled','health-only','quiet','stalled','person','hello','queued','2020-01-01T00:00:00.000Z')");
 const stalled=await connectionHealth('health-only');assert.equal(stalled.accounts[0].delayed,true);assert.equal(stalled.accounts[0].nextAction.view,'guide');
});
test('account erasure removes metrics, timeline and health without crossing tenants',async()=>{
 const {deleteAccountData}=await import('../lib/retention.mjs');
 await deleteAccountData('owner','ig');
 for(const table of ['delivery_metrics','activity_events','connection_signals'])assert.equal((await db().execute(`SELECT count(*) AS n FROM ${table} WHERE tenant='owner'`)).rows[0].n,0);
 assert.equal((await db().execute("SELECT count(*) AS n FROM accounts WHERE tenant='health-only'")).rows[0].n,1);
});
test('retention keeps minimal metrics for 90 days and removes detailed timelines at 30 days',async()=>{
 const {rollupAndPurge}=await import('../lib/retention.mjs');const now=Date.now();
 for(const [id,age] of [['retained',40],['expired',100]]) {
  const createdAt=new Date(now-age*86400000).toISOString();
  await db().execute({sql:'INSERT INTO activity(id,tenant,campaign_id,comment_id,username,comment,status,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id,'retention-metrics','campaign',id,'person','text','sent',createdAt]});
  await db().execute({sql:'INSERT INTO activity_events VALUES(?,?,?,?)',args:['retention-metrics',id,'resource',createdAt]});
  await db().execute({sql:'INSERT INTO delivery_metrics(activity_id,tenant,campaign_id,account_id,person_key,gated,created_at,resource_at,outcome) VALUES(?,?,?,?,?,?,?,?,?)',args:[id,'retention-metrics','campaign','ig','hashed-person',0,createdAt,createdAt,'sent']});
 }
 await rollupAndPurge();assert.equal((await db().execute("SELECT count(*) AS n FROM activity_events WHERE tenant='retention-metrics'")).rows[0].n,0);
 const report=await conversionReport('retention-metrics',{period:'90'});assert.equal(report.campaigns[0].matched,1);assert.equal(report.campaigns[0].accepted,1);assert.equal((await db().execute("SELECT count(*) AS n FROM delivery_metrics WHERE tenant='retention-metrics'")).rows[0].n,1);
});
test('pre-existing opt-outs stay in the matched denominator and never queue a message',async()=>{
 await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['blocked','optout-report',JSON.stringify({...base,accountId:'ig',deliveryMode:'immediate'})]});
 await db().execute("INSERT INTO opt_outs VALUES('optout-report','ig','blocked-person')");
 const r=await processComment('optout-report',input('blocked-comment','blocked-person'));assert.equal(r.status,'skipped');
 const report=await conversionReport('optout-report');assert.equal(report.campaigns[0].matched,1);assert.equal(report.campaigns[0].accepted,0);assert.equal(report.problems[0].code,'opt-out');
 const timeline=await activityTimeline('optout-report',r.id);assert.ok(timeline.events.some(e=>e.stage==='matched'));assert.ok(!timeline.events.some(e=>e.stage==='queued'));
});
test('demo seed produces explicitly simulated funnel examples without a Meta call',async()=>{
 const {seed}=await import('../lib/db.mjs');const previous=global.fetch;global.fetch=async()=>{throw Error('Demo must not call Meta');};
 try {await seed('demo:insights');const report=await conversionReport('demo:insights');assert.ok(report.campaigns.length>0);assert.equal(report.campaigns.reduce((sum,c)=>sum+c.acceptedReplies,0),6);assert.equal((await connectionHealth('demo:insights',{demo:true})).demo,true);}finally{global.fetch=previous;}
});
