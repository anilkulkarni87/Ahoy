import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';
process.env.ENCRYPTION_KEY='d'.repeat(64);
process.env.META_API_VERSION='v99.0';
process.env.LIVE_SENDS_ENABLED='true';
const {db,init}=await import('../lib/db.mjs');
const {encrypt,validateCampaign}=await import('../lib/core.mjs');
const {processComment,deliver}=await import('../lib/engine.mjs');
const {followChecks,checkFollow}=await import('../lib/follow.mjs');
await init();
const campaign={name:'Guide',active:true,triggerType:'any',accountId:'ig',keywords:['GUIDE'],dmTemplate:'Your secret resource',linkUrl:'https://example.com/secret',matchMode:'contains',deliveryMode:'after-follow',followMessage:'Please follow for the guide'};
await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:['gated','owner',JSON.stringify(campaign)]});
await db().execute({sql:'INSERT INTO accounts(id,tenant,username,token,auth_type) VALUES(?,?,?,?,?)',args:['ig','owner','studio',encrypt('private-test-token'),'unified']});
let seq=0;
async function request() {
 const r=await processComment('owner',{commentId:'gate-'+(++seq),username:'maya',userId:'comment-actor',text:'GUIDE',accountId:'ig'});
 const sends=[];
 global.fetch=async(url,options)=>{sends.push(JSON.parse(options.body));return Response.json({recipient_id:'messaging-user',message_id:'private-'+seq});};
 assert.equal((await deliver(r.id)).awaitingFollow,true);
 assert.equal(sends.length,1);assert.ok(!JSON.stringify(sends).includes('/secret'));assert.match(sends[0].message.text,/tap Check follow/i);assert.ok(!sends[0].message.text.includes(r.id.slice(0,8).toUpperCase()));assert.deepEqual(sends[0].message.quick_replies,[{content_type:'text',title:'Check follow',payload:'ahoy:follow:'+r.id}]);
 const row=(await db().execute({sql:'SELECT * FROM follow_requests WHERE activity_id=?',args:[r.id]})).rows[0];assert.equal(row.user_id,'messaging-user');
 return r;
}
function inbound(r,options={}) {return {sender:{id:'messaging-user'},timestamp:Date.now(),message:{text:'CHECK '+r.id.slice(0,8),mid:'inbound-'+r.id},...options};}
async function consent(r,item=inbound(r)) {const checks=await followChecks('ig',item);assert.equal(checks.length,1);return checks[0];}
async function state(r){return (await db().execute({sql:'SELECT * FROM activity WHERE id=?',args:[r.id]})).rows[0];}

test('campaign modes default safely and validate without enabling legacy requireFollow',()=>{
 assert.equal(validateCampaign({...campaign,deliveryMode:undefined}).deliveryMode,'immediate');
 assert.equal(validateCampaign(campaign).deliveryMode,'after-follow');
 for(const change of [{deliveryMode:'other'},{inviteFollow:'true'},{followMessage:''},{followMessage:'x'.repeat(401)},{requireFollow:true}])assert.throws(()=>validateCampaign({...campaign,...change}));
});
test('initial request withholds resource and duplicate comment cannot send it again',async()=>{
 const r=await request();assert.equal((await state(r)).status,'awaiting-follow');let calls=0;global.fetch=async()=>{calls++;throw Error('must not send');};await deliver(r.id);assert.equal(calls,0);
});
test('only the expected sender/account and a fresh inbound text can establish consent',async()=>{
 const r=await request();
 for(const item of [inbound(r,{sender:{id:'another-user'}}),inbound(r,{timestamp:Date.now()-24*3600000}),inbound(r,{message:{text:'CHECK',is_echo:true,mid:'echo'}}),inbound(r,{message:{text:'CHECK'}}),inbound(r,{postback:{payload:'ahoy:follow:'+r.id,mid:'click'},message:undefined})])assert.deepEqual(await followChecks('ig',item),[]);
 assert.deepEqual(await followChecks('other-account',inbound(r)),[]);
 assert.equal((await db().execute({sql:'SELECT consent_at FROM follow_requests WHERE activity_id=?',args:[r.id]})).rows[0].consent_at,0);
});
test('a false follow check holds resource and offers buttons; replay sends nothing',async()=>{
 const r=await request(),event=await consent(r),calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,body:opts.body&&JSON.parse(opts.body)});return Response.json(opts.method==='POST'?{message_id:'reminder'}:{is_user_follow_business:false});};
 assert.equal((await checkFollow(event)).status,'awaiting-follow');
 assert.equal(calls.length,2);assert.equal(calls[1].body.message.attachment.payload.buttons[0].title,'Visit profile');assert.ok(!JSON.stringify(calls).includes('/secret'));
 await checkFollow(event,Date.now()+31000);assert.equal(calls.length,2);
});
test('only explicit true releases once and uses messaging recipient, persisted host and resource snapshot',async()=>{
 const r=await request(),event=await consent(r),calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,body:opts.body&&JSON.parse(opts.body)});await new Promise(resolve=>setTimeout(resolve,3));return Response.json(opts.method==='POST'?{message_id:'resource'}:{is_user_follow_business:true});};
 const results=await Promise.all([checkFollow(event),checkFollow(event)]);
 assert.ok(results.some(r=>r.status==='sent'));assert.equal(calls.length,2);assert.ok(calls.every(c=>new URL(c.url).host==='graph.facebook.com'));assert.equal(calls[1].body.recipient.id,'messaging-user');assert.equal(calls[1].body.message.text,'Your secret resource\nhttps://example.com/secret');await checkFollow({...event,eventId:'new'});assert.equal(calls.length,2);
});
test('missing, nonboolean and rejected follow lookups fail closed',async()=>{
 for(const response of [{},{is_user_follow_business:'true'},{error:{code:100}}]) {
  const r=await request(),event=await consent(r);let posts=0;global.fetch=async(url,opts)=>{if(opts.method==='POST')posts++;return Response.json(response,{status:response.error?400:200});};
  assert.equal((await checkFollow(event)).status,'verification-unavailable');assert.equal(posts,0);assert.match((await state(r)).reason,/withheld/);
 }
});
test('expired consent, paused campaign, opt-out and disabled live sends never release',async()=>{
 for(const guard of ['expired','paused','optout','disabled']) {
  const r=await request(),event=await consent(r);let calls=0;global.fetch=async()=>{calls++;throw Error('must not call');};
  if(guard==='expired')await db().execute({sql:'UPDATE follow_requests SET consent_at=? WHERE activity_id=?',args:[Date.now()-24*3600000,r.id]});
  if(guard==='paused')await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify({...campaign,active:false}),'gated']});
  if(guard==='optout')await db().execute("INSERT OR IGNORE INTO opt_outs VALUES('owner','ig','messaging-user')");
  if(guard==='disabled')process.env.LIVE_SENDS_ENABLED='false';
  await checkFollow(event);assert.equal(calls,0);
  await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'gated']});await db().execute('DELETE FROM opt_outs');process.env.LIVE_SENDS_ENABLED='true';
 }
});
test('unknown resource send outcome is failed and never automatically resent',async()=>{
 const r=await request(),event=await consent(r);let posts=0;global.fetch=async(url,opts)=>{if(opts.method==='POST'){posts++;throw Error('timeout');}return Response.json({is_user_follow_business:true});};
 assert.equal((await checkFollow(event)).status,'failed');await checkFollow({...event,eventId:'again'},Date.now()+31000);assert.equal(posts,1);
});
test('CHECK without code cannot choose between multiple requests; postback cannot bypass expired text consent',async()=>{
 const r=await request(),s=await request();assert.deepEqual(await followChecks('ig',inbound(r,{message:{text:'CHECK',mid:'ambiguous'}})),[]);
 await consent(s);assert.equal((await followChecks('ig',inbound(s,{message:undefined,postback:{payload:'ahoy:follow:'+s.id,mid:'button'}}))).length,1);
 await db().execute({sql:'UPDATE follow_requests SET consent_at=? WHERE activity_id=?',args:[Date.now()-24*3600000,s.id]});assert.deepEqual(await followChecks('ig',inbound(s,{message:undefined,postback:{payload:'ahoy:follow:'+s.id,mid:'old-window'}})),[]);
});
test('immediate invitations append profile after resource without creating a gate',async()=>{
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify({...campaign,deliveryMode:'immediate',inviteFollow:true}),'gated']});
 const r=await processComment('owner',{commentId:'invitation',username:'maya',userId:'user',text:'GUIDE',accountId:'ig'});
 assert.match(r.message,/Your secret resource\nhttps:\/\/example.com\/secret/);assert.match(r.message,/https:\/\/www.instagram.com\/studio\//);assert.equal((await db().execute({sql:'SELECT * FROM follow_requests WHERE activity_id=?',args:[r.id]})).rows.length,0);
});
test('a fresh CHECK recovers an interrupted read-only verification, without replaying a resource send',async()=>{
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'gated']});
 const r=await request();await consent(r);
 await db().execute({sql:"UPDATE activity SET status='checking-follow' WHERE id=?",args:[r.id]});
 await db().execute({sql:'UPDATE follow_requests SET check_after=? WHERE activity_id=?',args:[Date.now()-90000,r.id]});
 const event=await consent(r,inbound(r,{message:{text:'CHECK '+r.id.slice(0,8),mid:'recovery'}}));
 let sends=0;global.fetch=async(url,opts)=>{if(opts.method==='POST')sends++;return Response.json(opts.method==='POST'?{message_id:'recovered'}:{is_user_follow_business:true});};
 assert.equal((await checkFollow(event)).status,'sent');assert.equal(sends,1);
});
test('separate taps on one button get distinct event IDs while webhook redelivery stays idempotent',async()=>{
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'gated']});
 const r=await request();await consent(r);
 const firstTime=Date.now();
 const tap=time=>({sender:{id:'messaging-user'},timestamp:time,postback:{mid:'same-button-message',payload:'ahoy:follow:'+r.id}});
 const [first]=await followChecks('ig',tap(firstTime),firstTime);
 const [duplicate]=await followChecks('ig',tap(firstTime),firstTime);
 assert.equal(first.eventId,duplicate.eventId);
 global.fetch=async(url,opts)=>Response.json(opts.method==='POST'?{message_id:'reminder'}:{is_user_follow_business:false});
 assert.equal((await checkFollow(first,firstTime)).status,'awaiting-follow');
 let calls=0;global.fetch=async(url,opts)=>{calls++;return Response.json(opts.method==='POST'?{message_id:'resource'}:{is_user_follow_business:true});};
 await checkFollow(duplicate,firstTime+31000);assert.equal(calls,0,'redelivery must not run verification again');
 const [later]=await followChecks('ig',tap(firstTime+31000),firstTime+31000);
 assert.notEqual(first.eventId,later.eventId);
 assert.equal((await checkFollow(later,firstTime+31000)).status,'sent');assert.equal(calls,2);
});
test('initial quick reply establishes real-message consent and selects the resource without a typed code',async()=>{
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'gated']});
 const r=await request();await request();
 const [event]=await followChecks('ig',inbound(r,{message:{mid:'first-quick-reply',text:'Check follow',quick_reply:{payload:'ahoy:follow:'+r.id}}}));
 assert.equal(event.id,r.id);assert.equal(event.eventId,'first-quick-reply');
 let sends=0;global.fetch=async(url,opts)=>{if(opts.method==='POST')sends++;return Response.json(opts.method==='POST'?{message_id:'unlocked'}:{is_user_follow_business:true});};
 assert.equal((await checkFollow(event)).status,'sent');assert.equal(sends,1);
});
test('quick replies cannot establish consent without a matching sender, payload, message ID and message text',async()=>{
 const r=await request();
 const quick={mid:'quick',text:'Check follow',quick_reply:{payload:'ahoy:follow:'+r.id}};
 for(const item of [inbound(r,{sender:{id:'wrong'},message:quick}),inbound(r,{message:{...quick,mid:undefined}}),inbound(r,{message:{...quick,text:undefined}}),inbound(r,{message:{...quick,quick_reply:{payload:'unrelated'}}})])assert.deepEqual(await followChecks('ig',item),[]);
 const consentAt=(await db().execute({sql:'SELECT consent_at FROM follow_requests WHERE activity_id=?',args:[r.id]})).rows[0].consent_at;assert.equal(consentAt,0);
});
test('explicit Meta validation rejection falls back once to text with a code and withholds the resource',async()=>{
 const r=await processComment('owner',{commentId:'format-rejected',username:'maya',userId:'actor',text:'GUIDE',accountId:'ig'});
 const messages=[];global.fetch=async(url,opts)=>{messages.push(JSON.parse(opts.body).message);return messages.length===1?Response.json({error:{code:100}},{status:400}):Response.json({recipient_id:'messaging-user',message_id:'text-fallback'});};
 assert.equal((await deliver(r.id)).awaitingFollow,true);assert.equal(messages.length,2);assert.equal(messages[1].quick_replies,undefined);assert.match(messages[1].text,new RegExp('CHECK '+r.id.slice(0,8).toUpperCase()));assert.ok(!JSON.stringify(messages).includes('/secret'));assert.match((await state(r)).reason,/rejected the quick-reply format/);
 await deliver(r.id);assert.equal(messages.length,2);
});
test('unknown initial quick-reply outcome and server errors do not attempt another private reply',async()=>{
 for(const scenario of ['timeout','server-error']) {
  const r=await processComment('owner',{commentId:scenario+'-initial',username:'maya',userId:'actor',text:'GUIDE',accountId:'ig'});let calls=0;
  global.fetch=async()=>{calls++;if(scenario==='timeout')throw Error('timeout');return Response.json({error:{code:2}},{status:500});};
  assert.equal((await deliver(r.id)).status,'failed');assert.equal(calls,1);await deliver(r.id);assert.equal(calls,1);
 }
});
test('follow requests keep resource snapshots and disappear with account data deletion',async()=>{
 const {deleteAccountData}=await import('../lib/retention.mjs');
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify(campaign),'gated']});
 const r=await request(),event=await consent(r);
 await db().execute({sql:'UPDATE campaigns SET data=? WHERE id=?',args:[JSON.stringify({...campaign,dmTemplate:'A new unrelated resource'}),'gated']});
 let message;global.fetch=async(url,opts)=>{if(opts.method==='POST')message=JSON.parse(opts.body).message.text;return Response.json(opts.method==='POST'?{message_id:'ok'}:{is_user_follow_business:true});};
 await checkFollow(event);assert.equal(message,'Your secret resource\nhttps://example.com/secret');
 await deleteAccountData('owner','ig');assert.equal((await db().execute("SELECT * FROM follow_requests WHERE tenant='owner' AND account_id='ig'")).rows.length,0);
});
