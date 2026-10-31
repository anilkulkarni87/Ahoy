import { randomUUID } from 'node:crypto';
import { db, init, campaigns, query } from './db.mjs';
import { matches, optedOut, personalize, decrypt } from './core.mjs';
export async function processComment(tenant, input, demo=false) {
  await init();
  if (!input.commentId || !input.username || typeof input.text!=='string') throw new Error('A comment id, username and comment are required.');
  const existing=(await query(tenant,'SELECT * FROM activity WHERE tenant=? AND comment_id=?',[input.commentId])).rows[0];
  if(existing) return {...existing,duplicate:true};
  const list=await campaigns(tenant);
  const accountId=input.accountId||'demo-account';
  const userId=String(input.userId||input.username);
  if(optedOut(input.text)) await db().execute({sql:'INSERT OR IGNORE INTO opt_outs (tenant,account_id,username) VALUES (?,?,?)',args:[tenant,accountId,userId]});
  const opt=(await query(tenant,'SELECT * FROM opt_outs WHERE tenant=? AND account_id=? AND username=?',[accountId,userId])).rows.length;
  const c=list.find(c=>c.active && (!c.accountId || c.accountId===accountId) && (c.triggerType==='any'||c.mediaId===input.mediaId) && matches(input.text,c.keywords,c.matchMode,c.ignoreCase));
  const status=opt||!c?'skipped':demo?'sent':'queued';
  const reason=opt?'This person opted out.':!c?'No active campaign keyword matched.':demo?'Demo only. No Instagram message was sent.':'Waiting for delivery.';
  const id=randomUUID();
  let message=c?personalize(c.dmTemplate,input.username):'';
  if(c?.linkUrl) {
    const linkId=randomUUID();
    await db().execute({sql:'INSERT INTO links (id,tenant,campaign_id,url) VALUES (?,?,?,?)',args:[linkId,tenant,c.id,c.linkUrl]});
    message+='\n'+(process.env.APP_URL||'http://localhost:3000')+'/api/go/'+linkId;
  }
  const inserted=await db().execute({sql:'INSERT OR IGNORE INTO activity (id,tenant,campaign_id,comment_id,username,comment,message,account_id,user_id,status,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)',args:[id,tenant,c?.id||null,input.commentId,input.username,input.text,message,accountId,userId,status,reason]});
  if(!inserted.rowsAffected) return {duplicate:true};
  return {id,status,reason,message,campaign:c?.name};
}
export async function meta(path,token,options={}) {
  const version=process.env.META_API_VERSION;
  if(!/^v\d+\.\d+$/.test(version||'')) throw new Error('Set a supported META_API_VERSION before connecting Instagram.');
  const response=await fetch(`https://graph.instagram.com/${version}/${path}`,{...options,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok||body.error) { const e=new Error(body.error?.message||'Instagram could not complete that request.'); e.code=body.error?.code; e.httpStatus=response.status; throw e; }
  return body;
}
export async function deliver(id) {
  await init();
  const row=(await db().execute({sql:'SELECT * FROM activity WHERE id=? AND tenant=?',args:[id,'owner']})).rows[0];
  if(!row || !['queued','rate-limited'].includes(row.status)) return {skipped:true};
  const c=(await campaigns('owner')).find(c=>c.id===row.campaign_id);
  if(!c?.active) return update(id,'skipped','Campaign is paused.');
  const account=(await query('owner','SELECT * FROM accounts WHERE tenant=? AND id=?',[c.accountId])).rows[0];
  if(!account) return update(id,'failed','Instagram account is no longer connected.');
  const opt=(await query('owner','SELECT * FROM opt_outs WHERE tenant=? AND account_id=? AND username=?',[account.id,row.user_id||row.username])).rows.length;
  if(opt) return update(id,'skipped','This person opted out.');
  if(process.env.LIVE_SENDS_ENABLED!=='true') return update(id,'failed','Live sends are disabled. Complete the launch checks first.');
  // Conditional claim prevents overlapping workers from sending the same private reply.
  const claim=await db().execute({sql:"UPDATE activity SET status='sending',reason='Delivery in progress.' WHERE id=? AND status IN ('queued','rate-limited')",args:[id]});
  if(!claim.rowsAffected) return {skipped:true};
  try {
    await meta(`${account.id}/messages`,decrypt(account.token),{method:'POST',body:JSON.stringify({recipient:{comment_id:row.comment_id},message:{text:row.message}})});
    await update(id,'sent','Delivered by Instagram.');
    if(c.publicReply) { try {await meta(`${row.comment_id}/replies`,decrypt(account.token),{method:'POST',body:JSON.stringify({message:personalize(c.publicReply,row.username)})});} catch {await update(id,'sent','DM delivered; public reply could not be posted.');} }
    return {sent:true};
  } catch(e) {
    // An unknown network outcome must not be resent automatically.
    if(e.httpStatus===429 || [4,32,613].includes(e.code)) {await update(id,'rate-limited','Instagram asked us to wait. The workflow will try again.'); throw e;}
    return update(id,'failed',e.httpStatus ? 'Instagram rejected the message. Check permissions, token and comment age before retrying.' : 'Delivery could not be confirmed. Check Instagram before retrying to avoid duplicates.');
  }
}
export async function update(id,status,reason) { await db().execute({sql:'UPDATE activity SET status=?,reason=? WHERE id=?',args:[status,reason,id]}); return {status,reason}; }
