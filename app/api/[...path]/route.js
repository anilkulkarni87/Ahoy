import { launchPreview,prepareLaunch,launchBoundary } from '../../../lib/launch.mjs';
import { checkButtonStatus } from '../../../lib/button-status.mjs';
import { rateLimit } from '../../../lib/rate-limit.mjs';
import { readLimitedText } from '../../../lib/request.mjs';
import { NextResponse } from 'next/server';
import { randomBytes,randomUUID,createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { db,init,query,campaigns,seed } from '../../../lib/db.mjs';
import { identity,sameOrigin,demoCookie,hash } from '../../../lib/auth.mjs';
import { validateCampaign,signatureValid,encrypt,decrypt,isBot } from '../../../lib/core.mjs';
import { processComment,meta } from '../../../lib/engine.mjs';
import { inngest,dispatchEvent } from '../../../lib/jobs.mjs';
import { deleteAccountData } from '../../../lib/retention.mjs';
import { storageConfig } from '../../../lib/storage.mjs';
import { signInBaseUrl,sendSignInEmail } from '../../../lib/email-auth.mjs';
import { diagnostics } from '../../../lib/diagnostics.mjs';
import { authOptions,adminSignIn } from '../../../lib/admin-auth.mjs';
import { loginMode,authorizationUrl,exchangeConnection } from '../../../lib/instagram.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
const secure=()=>(process.env.VERCEL||process.env.APP_URL?.startsWith('https://'))?'; Secure':'';
const emailValid=email=>typeof email==='string' && email.length<255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
async function body(req) {const text=await readLimitedText(req,32768);return JSON.parse(text||'{}');}
export async function GET(req,context) { try {
 await init(); const {path}=await context.params; const route=path.join('/'); const url=new URL(req.url);
 if(route==='auth/options') return json(authOptions());
 if(route==='session') {
  const who=await identity(req); if(who) return json(who);
  if(process.env.DEMO_MODE!=='false') {await rateLimit(req,'demo-session');const response=json({demo:true,newSession:true});response.headers.set('Set-Cookie',demoCookie()+secure());return response;}
  return json({needsLogin:true});
 }
 if(route==='webhook') {
  if(process.env.META_VERIFY_TOKEN && url.searchParams.get('hub.mode')==='subscribe' && url.searchParams.get('hub.verify_token')===process.env.META_VERIFY_TOKEN) return new Response(url.searchParams.get('hub.challenge'),{headers:{'Content-Type':'text/plain'}});
  return json({error:'Verification did not match.'},403);
 }
 if(route.startsWith('go/')) {
  const row=(await db().execute({sql:'SELECT * FROM links WHERE id=?',args:[path[1]]})).rows[0];
  if(!row) return json({error:'This link is no longer available.'},404);
  if(req.method!=='HEAD'&&!isBot(req.headers)) await db().execute({sql:'UPDATE links SET clicks=clicks+1 WHERE id=?',args:[row.id]});
  return NextResponse.redirect(row.url,302);
 }
 if(route==='auth/verify') {
  const token=url.searchParams.get('token')||'';
  const result=await db().execute({sql:'DELETE FROM auth_tokens WHERE hash=? AND expires>? RETURNING email',args:[hash(token),Date.now()]});
  const row=result.rows[0]; if(!row) return NextResponse.redirect(new URL('/?view=login&expired=1',req.url));
  const session=randomBytes(32).toString('hex');
  await db().execute({sql:'INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)',args:[hash(session),row.email,Date.now()+7*86400000]});
  const response=NextResponse.redirect(new URL('/?view=dashboard',req.url));response.headers.set('Set-Cookie',`ahoy_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure()}`);return response;
 }
 const who=await identity(req); if(!who) return json({error:'Please sign in to continue.'},401);
 const tenant=who.tenant;
 if(route==='state') {
  if(who.demo) {await rateLimit(req,'demo-state',120,3600000);await seed(tenant);}
  const analyticsSince=await launchBoundary(tenant);
  const since=analyticsSince||'1970-01-01T00:00:00.000Z';
  const [list,activityResult,accountResult,linkResult,countResult,campaignStatsResult]=await Promise.all([
   campaigns(tenant),
   query(tenant,'SELECT * FROM activity WHERE tenant=? AND julianday(created_at)>=julianday(?) ORDER BY julianday(created_at) DESC LIMIT 200',[since]),
   who.demo?Promise.resolve({rows:[{id:'demo-account',username:'the.slow.studio',demo:true}]}):query(tenant,'SELECT a.id,a.username,a.expires_at,a.auth_type,b.status AS button_status,b.checked_at AS button_checked_at FROM accounts a LEFT JOIN account_button_status b ON b.tenant=a.tenant AND b.account_id=a.id WHERE a.tenant=?'),
   query(tenant,'SELECT campaign_id,sum(clicks) AS clicks FROM links WHERE tenant=? AND id NOT IN (SELECT id FROM archived_links WHERE tenant=links.tenant) GROUP BY campaign_id'),
   query(tenant,"SELECT sum(comments) AS comments,sum(sent) AS sent FROM (SELECT count(*) AS comments,sum(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent FROM activity WHERE tenant=? AND julianday(created_at)>=julianday(?) UNION ALL SELECT comments,sent FROM daily_stats WHERE tenant=? AND date>=date(?))",[since,tenant,since]),
   query(tenant,"SELECT campaign_id,sum(sent) AS sent FROM (SELECT campaign_id,sum(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent FROM activity WHERE tenant=? AND julianday(created_at)>=julianday(?) GROUP BY campaign_id UNION ALL SELECT campaign_id,sent FROM daily_stats WHERE tenant=? AND date>=date(?)) GROUP BY campaign_id",[since,tenant,since])
  ]);
  const activity=activityResult.rows,accounts=accountResult.rows,links=linkResult.rows,counts=countResult.rows[0];
  return json({campaigns:list,activity,accounts,links,counts,campaignStats:campaignStatsResult.rows,analyticsSince,demo:who.demo,temporaryStorage:storageConfig().temporary,diagnostics:diagnostics(who.demo?0:accounts.length)});
 }
 if(route==='workspace/launch-preview') {if(who.demo)return json({error:'Owner access required.'},403);return json(await launchPreview(tenant));}
 if(route==='instagram/connect') {
  if(who.demo) return json({error:'Sign in as the owner to connect a real account. Demo mode never accesses Instagram.'},403);
  const state=loginMode()+'.'+randomBytes(32).toString('hex');
  const auth=authorizationUrl(state);
  const response=NextResponse.redirect(auth);response.headers.set('Set-Cookie',`ahoy_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure()}`);return response;
 }
 if(route==='instagram/callback') {
  if(who.demo) return json({error:'Owner sign-in required.'},403);
  const cookie=(req.headers.get('cookie')||'').match(/ahoy_oauth=([^;]+)/)?.[1];
  if(!cookie||cookie!==url.searchParams.get('state')||!url.searchParams.get('code')) return json({error:'This connection expired. Start again from Accounts.'},400);
  if(!cookie.startsWith(loginMode()+'.')) return json({error:'Login settings changed. Start again from Accounts.'},400);
  const accounts=await exchangeConnection(url.searchParams.get('code'));
  await db().batch(accounts.map(a=>({sql:'INSERT INTO accounts(id,tenant,username,token,expires_at,auth_type) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,username=excluded.username,expires_at=excluded.expires_at,auth_type=excluded.auth_type',args:[a.id,tenant,a.username,encrypt(a.token),a.expiresAt,a.authType]})),'write');
  await db().batch(accounts.map(a=>({sql:'DELETE FROM account_button_status WHERE tenant=? AND account_id=?',args:[tenant,a.id]})),'write');
  const response=NextResponse.redirect(new URL('/?view=accounts&connected=1',req.url));response.headers.set('Set-Cookie',`ahoy_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);return response;
 }
 if(route==='inquiries') {
  if(who.demo) return json({error:'Owner sign-in required.'},403);
  return json({waitlist:(await db().execute('SELECT email,use_case,created_at FROM waitlist ORDER BY created_at DESC LIMIT 1000')).rows,requests:(await db().execute('SELECT email,details,created_at FROM setup_requests ORDER BY created_at DESC LIMIT 1000')).rows});
 }
 if(route==='media') {
  if(who.demo) return json({data:[]});
  const account=(await query(tenant,'SELECT * FROM accounts WHERE tenant=? AND id=?',[url.searchParams.get('accountId')||''])).rows[0];
  if(!account) return json({error:'Connect an Instagram account first.'},400);
  return json(await meta(`${account.id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink&limit=25`,decrypt(account.token),{},account.auth_type));
 }
 return json({error:'This page could not be found.'},404);
 } catch(e){console.error('Ahoy request failed:',e.name);if(e.connectionDiagnostics)console.error('Ahoy Instagram connection checks:',e.connectionDiagnostics);return json({error:e.message||'Something went wrong. Please try again.',...(e.connectionDiagnostics?{diagnostics:e.connectionDiagnostics}:{})},e.status||400);} }
export async function POST(req,context) {try {
 const {path}=await context.params;const route=path.join('/');
 if(route==='webhook')console.info('Ahoy webhook received',{signaturePresent:req.headers.has('x-hub-signature-256')});
 await init();
 if(route==='webhook') {
  const raw=await readLimitedText(req,1000000);
  if(!signatureValid(raw,req.headers.get('x-hub-signature-256'),process.env.META_APP_SECRET)) {console.warn('Ahoy webhook rejected: signature check failed.');return json({error:'Signature rejected.'},403);}
  const id=createHash('sha256').update(raw).digest('hex');const payload=JSON.parse(raw);
  await db().execute({sql:'INSERT OR IGNORE INTO webhook_events(id,payload) VALUES(?,?)',args:[id,raw]});
  console.info('Ahoy webhook saved',{entryCount:Array.isArray(payload.entry)?payload.entry.length:0});
  // Persist before acknowledging; reconciliation recovers dispatch failures.
  try {await inngest.send({id:'webhook:'+id,name:'ahoy/webhook.received',data:{id}});console.info('Ahoy webhook handed to Inngest');} catch {console.error('Ahoy webhook saved but Inngest dispatch failed; reconciliation must recover it.');}
  return json({received:true});
 }
 if(route==='data-deletion') {
  if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'A signed form request is required.'},415);
  const form=new URLSearchParams(await readLimitedText(req,32768));const signed=String(form.get('signed_request')||'');const [sig,encoded]=signed.split('.');
  if(!process.env.META_APP_SECRET||!sig||!encoded) return json({error:'Signed request required.'},403);
  const expected=createHmac('sha256',process.env.META_APP_SECRET).update(encoded).digest();const actual=Buffer.from(sig,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) return json({error:'Invalid signature.'},403);
  const data=JSON.parse(Buffer.from(encoded,'base64url').toString());
  if(data.algorithm!=='HMAC-SHA256'||!data.user_id) return json({error:'Invalid deletion request.'},400);
  const confirmation=randomBytes(16).toString('hex');
  await deleteAccountData('owner',String(data.user_id));
  return json({url:(process.env.APP_URL||new URL(req.url).origin)+'/?view=deletion',confirmation_code:confirmation});
 }
 if(!sameOrigin(req)) return json({error:'Please submit this from Ahoy.'},403);
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:'Send an application/json request.'},415);
 const b=await body(req);
 if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'A JSON object is required.'},400);
 if(['waitlist','setup-request','auth/login'].includes(route))await rateLimit(req,'public:'+route);
 if(['waitlist','setup-request'].includes(route)) {
  if(!emailValid(b.email)) return json({error:'Please enter a valid email address.'},400);
  if(b.website) return json({ok:true});
  if(route==='waitlist') await db().execute({sql:'INSERT OR IGNORE INTO waitlist(email,use_case) VALUES(?,?)',args:[b.email.toLowerCase(),String(b.useCase||'').slice(0,1000)]});
  else await db().execute({sql:'INSERT INTO setup_requests(id,email,details) VALUES(?,?,?)',args:[randomUUID(),b.email.toLowerCase(),String(b.details||'').slice(0,2000)]});
  return json({ok:true});
 }
 if(route==='auth/admin') {
  try {
    const session=await adminSignIn(req,b.token);
    const response=json({ok:true});
    response.headers.set('Set-Cookie',`ahoy_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure()}`);
    return response;
  } catch(e) {return json({error:e.message},e.status||400);}
 }
 if(route==='auth/login') {
  if(!emailValid(b.email)) throw new Error('Please enter a valid email address.');
  if(!process.env.RESEND_API_KEY||!process.env.OWNER_EMAIL||!process.env.EMAIL_FROM) throw new Error('Email sign-in is not configured yet. You can explore the demo or follow the setup guide.');
  if(b.email.trim().toLowerCase()!==process.env.OWNER_EMAIL.trim().toLowerCase()) return json({ok:true});
  const pending=(await db().execute({sql:'SELECT * FROM auth_tokens WHERE email=? AND expires>?',args:[b.email.toLowerCase(),Date.now()+14*60000]})).rows;
  if(pending.length) return json({ok:true});
  const address=signInBaseUrl();
  const token=randomBytes(32).toString('hex');
  await db().execute({sql:'INSERT INTO auth_tokens(hash,email,expires) VALUES(?,?,?)',args:[hash(token),b.email.toLowerCase(),Date.now()+15*60000]});
  try {await sendSignInEmail({email:b.email,token,baseUrl:address});}
  catch(e) {
    await db().execute({sql:'DELETE FROM auth_tokens WHERE hash=?',args:[hash(token)]});
    if(e.name==='TimeoutError'||e.name==='AbortError'||e instanceof TypeError) throw new Error('The email service could not be reached. Check your network and retry; this request will not block another attempt.');
    throw e;
  }
  return json({ok:true});
 }
 if(route==='auth/logout') { const response=json({ok:true});const value=(req.headers.get('cookie')||'').match(/ahoy_session=([a-f0-9]+)/)?.[1];if(value) await db().execute({sql:'DELETE FROM sessions WHERE hash=?',args:[hash(value)]});response.headers.set('Set-Cookie','ahoy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return response; }
 const who=await identity(req);if(!who) return json({error:'Please sign in to continue.'},401);
 const tenant=who.tenant;
 if(route==='campaigns') {
  const data=validateCampaign(b);
  if(!who.demo) {const account=(await query(tenant,'SELECT id FROM accounts WHERE tenant=? AND id=?',[b.accountId||''])).rows[0];if(!account) throw new Error('Choose a connected Instagram account.');data.accountId=account.id;}
  const id=b.id||randomUUID();
  if(b.id) {
    const result=await db().execute({sql:'UPDATE campaigns SET data=? WHERE tenant=? AND id=?',args:[JSON.stringify(data),tenant,id]});if(!result.rowsAffected) return json({error:'Campaign not found.'},404);
  } else await db().execute({sql:'INSERT INTO campaigns(id,tenant,data) VALUES(?,?,?)',args:[id,tenant,JSON.stringify(data)]});
  return json({id,...data});
 }
 if(route==='campaigns/toggle') { const c=(await campaigns(tenant)).find(c=>c.id===b.id);if(!c) throw new Error('Campaign not found.');c.active=!c.active;await db().execute({sql:'UPDATE campaigns SET data=? WHERE tenant=? AND id=?',args:[JSON.stringify(c),tenant,c.id]});return json(c); }
 if(route==='campaigns/delete') {await db().execute({sql:'DELETE FROM campaigns WHERE tenant=? AND id=?',args:[tenant,String(b.id)]});return json({ok:true});}
 if(route==='simulate') {
  if(!who.demo) throw new Error('Use demo mode to simulate a comment.');
  if(typeof b.text!=='string'||b.text.length>2200) throw new Error('Write a comment under 2,200 characters.');
  return json(await processComment(tenant,{commentId:randomUUID(),username:String(b.username||'you.creates').slice(0,60),text:b.text,mediaId:b.mediaId||'post-1'},true));
 }
 if(route==='simulate/follow') {
  if(!who.demo)throw new Error('Follow simulation is available only in the demo.');
  if(typeof b.following!=='boolean')throw new Error('Choose a simulated follow status.');
  const row=(await query(tenant,`SELECT a.id,f.resource_message FROM activity a JOIN follow_requests f ON f.activity_id=a.id WHERE a.tenant=? AND a.id=? AND a.status IN ('awaiting-follow','verification-unavailable')`,[String(b.id)])).rows[0];
  if(!row)throw new Error('No pending demo follow request found.');
  await db().execute({sql:'UPDATE activity SET status=?,reason=?,message=CASE WHEN ? THEN ? ELSE message END WHERE tenant=? AND id=?',args:[b.following?'sent':'awaiting-follow',b.following?'Demo follow verified; resource simulated. No Instagram message was sent.':'Demo: not following yet. Resource withheld.',b.following?1:0,row.resource_message,tenant,row.id]});
  return json((await query(tenant,'SELECT * FROM activity WHERE tenant=? AND id=?',[row.id])).rows[0]);
 }
 if(route==='activity/retry') {
  const row=(await query(tenant,'SELECT * FROM activity WHERE tenant=? AND id=?',[b.id])).rows[0];if(!row||row.status!=='failed') throw new Error('Only failed deliveries can be retried.');
  if((await db().execute({sql:'SELECT 1 FROM follow_requests WHERE activity_id=?',args:[row.id]})).rows.length)throw new Error('Check Instagram before starting a new follow request. Gated messages cannot be blindly retried.');
  if(!b.confirmed) throw new Error('Check that Instagram did not deliver this message before retrying.');
  const c=(await campaigns(tenant)).find(c=>c.id===row.campaign_id);
  if(!c) throw new Error('The campaign no longer exists.');
  await db().execute({sql:"UPDATE activity SET status=?,reason=? WHERE tenant=? AND id=?",args:[who.demo?'sent':'queued',who.demo?'Demo retry completed.':'Retry requested by owner.',tenant,row.id]});
  if(!who.demo) await inngest.send({id:'retry:'+randomUUID(),name:'ahoy/comment.ready',data:{id:row.id,accountId:c.accountId}});
  return json({ok:true});
 }
 if(route==='workspace/prepare-launch') {
  if(who.demo)return json({error:'Owner access required.'},403);
  return json(await prepareLaunch(tenant,b.confirmation,b.fingerprint));
 }
 if(['accounts/follow-buttons','accounts/follow-buttons/check'].includes(route)) {
  if(who.demo)throw new Error('Owner access required.');
  const account=(await query(tenant,'SELECT * FROM accounts WHERE tenant=? AND id=?',[String(b.id)])).rows[0];
  if(!account)throw new Error('Account not found.');
  return json(await checkButtonStatus(tenant,account,route==='accounts/follow-buttons'));
 }
 if(route==='accounts/check') {
  if(who.demo) return json({ok:true,message:'This is a sample account. Connect your own after setup.'});
  const account=(await query(tenant,'SELECT * FROM accounts WHERE tenant=? AND id=?',[b.id])).rows[0];if(!account) throw new Error('Account not found.');
  const result=await meta(`${account.id}?fields=id,username`,decrypt(account.token),{},account.auth_type);return json({ok:true,message:'Connected as @'+result.username+'. Token is valid; message permissions still require a live test.'});
 }
 if(route==='accounts/disconnect') {
  if(who.demo) throw new Error('This is a sample account. Your Instagram is not connected.');
  await db().batch([{sql:'DELETE FROM account_button_status WHERE tenant=? AND account_id=?',args:[tenant,b.id]},{sql:'DELETE FROM accounts WHERE tenant=? AND id=?',args:[tenant,b.id]},{sql:"UPDATE campaigns SET data=json_set(data,'$.active',json('false')) WHERE tenant=? AND json_extract(data,'$.accountId')=?",args:[tenant,b.id]}],'write');return json({ok:true});
 }
 if(route==='workspace/delete') {
  if(b.confirmation!=='DELETE') throw new Error('Type DELETE to remove this workspace’s data.');
  await db().batch(['campaigns','activity','accounts','links','opt_outs','daily_stats','follow_requests','workspace_settings','archived_links','account_button_status'].map(table=>({sql:`DELETE FROM ${table} WHERE tenant=?`,args:[tenant]})),'write');return json({ok:true});
 }
 return json({error:'Action not found.'},404);
 } catch(e) {console.error('Ahoy action failed:',e.name);return json({error:e.message||'Something went wrong. Please try again.'},e.status||400);} }
