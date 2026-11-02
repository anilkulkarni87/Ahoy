import { startMetricStatements,metricStatements,outcomeStatement,signalStatement } from './observability.mjs';
import { launchBoundary,beforeLaunch } from './launch.mjs';
import { graph } from './instagram.mjs';
import { randomUUID } from 'node:crypto';
import { db, init, campaigns, query } from './db.mjs';
import { matches, optedOut, personalize, decrypt } from './core.mjs';
import { profileUrl, followPrompt } from './follow.mjs';
export async function processComment(tenant, input, demo=false) {
  await init();
  if (!input.commentId || !input.username || typeof input.text!=='string') throw new Error('A comment id, username and comment are required.');
  const existing=(await query(tenant,'SELECT * FROM activity WHERE tenant=? AND comment_id=?',[input.commentId])).rows[0];
  if(existing) return {...existing,duplicate:true};
  const boundary=await launchBoundary(tenant);
  if(!demo&&beforeLaunch(input.timestamp,boundary))return {status:'skipped',reason:'Comment predates launch or has no valid timestamp.'};
  const list=await campaigns(tenant);
  const accountId=input.accountId||'demo-account';
  const userId=String(input.userId||input.username);
  if(optedOut(input.text)) await db().execute({sql:'INSERT OR IGNORE INTO opt_outs (tenant,account_id,username) VALUES (?,?,?)',args:[tenant,accountId,userId]});
  const opt=(await query(tenant,'SELECT * FROM opt_outs WHERE tenant=? AND account_id=? AND username=?',[accountId,userId])).rows.length;
  const c=list.find(c=>c.active && (!c.accountId || c.accountId===accountId) && (c.triggerType==='any'||c.mediaId===input.mediaId) && matches(input.text,c.keywords,c.matchMode,c.ignoreCase));
  const gated=c?.deliveryMode==='after-follow';
  const status=opt||!c?'skipped':demo?(gated?'awaiting-follow':'sent'):'queued';
  const reason=opt?'This person opted out.':!c?'No active campaign keyword matched.':demo?(gated?'Demo follow request. Simulate a follow check to release the resource.':'Demo only. No Instagram message was sent.'):'Waiting for delivery.';
  const id=randomUUID();
  let message=c?personalize(c.dmTemplate,input.username):'';
  if(c?.linkUrl) {
    if(c.trackClicks===true) {
      const linkId=randomUUID();
      await db().execute({sql:'INSERT INTO links (id,tenant,campaign_id,url) VALUES (?,?,?,?)',args:[linkId,tenant,c.id,c.linkUrl]});
      message+='\n'+new URL('/api/go/'+linkId,process.env.APP_URL||'http://localhost:3000').href;
    } else message+='\n'+c.linkUrl;
  }
  const resourceMessage=message;
  let profile;
  if(c&&(gated||c.inviteFollow)) {
    const account=demo?{username:'the.slow.studio'}:(await query(tenant,'SELECT username FROM accounts WHERE tenant=? AND id=?',[accountId])).rows[0];
    profile=profileUrl(account?.username);
    message=gated?followPrompt(c,input.username,profile):message+'\n'+personalize(c.followMessage||'Follow for more resources like this 🌿',input.username)+'\n'+profile;
  }
  if(message.length>2000||resourceMessage.length>2000)throw new Error('The complete message is too long. Shorten the message, link or follow request.');
  const createdAt=new Date().toISOString();
  const writes=[{sql:`INSERT OR IGNORE INTO activity (id,tenant,campaign_id,comment_id,username,comment,message,account_id,user_id,status,reason,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT analytics_since FROM workspace_settings WHERE tenant=?),'')=?`,args:[id,tenant,c?.id||null,input.commentId,input.username,input.text,message,accountId,userId,status,reason,createdAt,tenant,boundary||'']}];
  if(gated&&!opt)writes.push({sql:'INSERT INTO follow_requests(activity_id,tenant,account_id,user_id,resource_message,profile_url) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM activity WHERE id=?)',args:[id,tenant,accountId,userId,resourceMessage,profile,id]});
  writes.push(...startMetricStatements({tenant,id,campaignId:c?.id,accountId,person:userId,gated,createdAt,status,demo,blockedReason:opt&&c?'opt-out':null}));
  const [inserted]=await db().batch(writes,'write');
  if(!inserted.rowsAffected) return {duplicate:true};
  return {id,status,reason,message,campaign:c?.name,gated:!!gated};
}
export const meta=graph;
export async function deliver(id) {
  await init();
  const row=(await db().execute({sql:'SELECT * FROM activity WHERE id=? AND tenant=?',args:[id,'owner']})).rows[0];
  if(!row || !['queued','rate-limited'].includes(row.status)) return {skipped:true};
  if(beforeLaunch(row.created_at,await launchBoundary('owner')))return update(id,'skipped','Closed when preparing for launch.','closed');
  const stored=(await query('owner','SELECT data FROM campaigns WHERE tenant=? AND id=?',[row.campaign_id])).rows[0];
  const c=stored?JSON.parse(stored.data):null;
  const follow=(await db().execute({sql:'SELECT * FROM follow_requests WHERE activity_id=?',args:[id]})).rows[0];
  if(!c?.active) return update(id,'skipped','Campaign is paused.','paused');
  const account=(await query('owner','SELECT * FROM accounts WHERE tenant=? AND id=?',[row.account_id||c.accountId])).rows[0];
  if(!account) return update(id,'failed','Instagram account is no longer connected.','disconnected');
  const opt=(await query('owner','SELECT * FROM opt_outs WHERE tenant=? AND account_id=? AND username=?',[account.id,row.user_id||row.username])).rows.length;
  if(opt) return update(id,'skipped','This person opted out.','opt-out');
  if(process.env.LIVE_SENDS_ENABLED!=='true') return update(id,'failed','Live sends are disabled. Complete the launch checks first.','live-off');
  // Conditional claim prevents overlapping workers from sending the same private reply.
  const claim=await db().execute({sql:"UPDATE activity SET status='sending',reason='Delivery in progress.' WHERE id=? AND status IN ('queued','rate-limited')",args:[id]});
  if(!claim.rowsAffected) return {skipped:true};
  try {
    await db().batch([...metricStatements('owner',id,'worker'),signalStatement('owner',account.id,'worker')],'write');
    const token=decrypt(account.token);
    const request=message=>meta(`${account.id}/messages`,token,{method:'POST',body:JSON.stringify({recipient:{comment_id:row.comment_id},message})},account.auth_type);
    let sent,usedTextFallback=false;
    try {
      sent=await request({text:row.message,...(follow?{quick_replies:[{content_type:'text',title:'Check follow',payload:'ahoy:follow:'+id}]}:{})});
    } catch(e) {
      // Retry plain text only after an explicit validation rejection, never after an unknown send outcome.
      if(!follow||e.httpStatus!==400||e.code!==100)throw e;
      const fallback=row.message.replace('tap Check follow below','reply CHECK '+id.slice(0,8).toUpperCase()).replace(' Button missing? Reply CHECK.','');
      sent=await request({text:fallback});usedTextFallback=true;
      await db().execute({sql:'UPDATE activity SET message=? WHERE id=?',args:[fallback,id]});
    }
    await db().batch([...metricStatements('owner',id,follow?'request':'resource'),signalStatement('owner',account.id,'accepted','ok')],'write');
    if(follow) {
      // Use the messaging recipient ID returned by Meta, which may differ from a comment actor ID.
      if(sent.recipient_id)await db().execute({sql:'UPDATE follow_requests SET user_id=?,message_id=? WHERE activity_id=?',args:[String(sent.recipient_id),sent.message_id||null,id]});
      await update(id,'awaiting-follow',usedTextFallback?'Meta rejected the quick-reply format; text CHECK request sent. Waiting for a verified follow.':'Follow request sent with Check follow quick reply. Waiting for a button reply and verified follow.');
    } else await update(id,'sent','Resource accepted by Meta.');
    if(c.publicReply) { try {await meta(`${row.comment_id}/replies`,decrypt(account.token),{method:'POST',body:JSON.stringify({message:personalize(c.publicReply,row.username)})},account.auth_type);} catch {await db().execute({sql:'UPDATE activity SET reason=? WHERE id=? AND status=?',args:[follow?'Follow request accepted; public reply could not be posted.':'Resource accepted; public reply could not be posted.',id,follow?'awaiting-follow':'sent']});} }
    return follow?{awaitingFollow:true}:{sent:true};
  } catch(e) {
    // An unknown network outcome must not be resent automatically.
    if(e.httpStatus===429 || [4,32,613].includes(e.code)) {await update(id,'rate-limited','Instagram asked us to wait. The workflow will try again.','rate-limit'); throw e;}
    return update(id,'failed',e.httpStatus ? 'Instagram rejected the message. Check permissions, token and comment age before retrying.' : 'Delivery could not be confirmed. Check Instagram before retrying to avoid duplicates.',e.httpStatus?'meta-rejected':'unknown-outcome');
  }
}
export async function update(id,status,reason,code=null) { await db().batch([{sql:'UPDATE activity SET status=?,reason=? WHERE id=?',args:[status,reason,id]},outcomeStatement('owner',id,status,code),...(['failed','rate-limited'].includes(status)?metricStatements('owner',id,status==='failed'?'failed':'limited'):[])],'write'); return {status,reason}; }
