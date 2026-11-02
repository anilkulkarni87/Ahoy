import { db, init } from './db.mjs';
import { decrypt } from './core.mjs';
import { graph } from './instagram.mjs';

export const followStatuses=['awaiting-follow','verification-unavailable'];
export function profileUrl(username) {
  if(!/^[a-zA-Z0-9._]{1,30}$/.test(username||'')) throw new Error('Reconnect the Instagram account to confirm its profile address.');
  return `https://www.instagram.com/${username}/`;
}
export function followPrompt(c,username,profile,id) {
  return `${c.followMessage||'Follow for more resources like this 🌿'}\n${profile}\nAfter following, reply CHECK ${id.slice(0,8).toUpperCase()} here to receive your resource.`.replaceAll('{username}',username);
}
async function status(id,value,reason) {
  await db().execute({sql:'UPDATE activity SET status=?,reason=? WHERE id=?',args:[value,reason,id]});
  return {status:value,reason};
}
// Only signed messaging webhooks call this. A URL click never establishes consent.
export async function followChecks(accountId,item,now=Date.now()) {
  if(!item.sender?.id||item.sender.id===accountId||item.message?.is_echo)return [];
  const timestamp=Number(item.timestamp);
  if(!Number.isFinite(timestamp)||timestamp>now+60000||timestamp<now-23*3600000)return [];
  const text=item.message?.text?.trim();
  const match=/^CHECK(?:\s+([a-f0-9]{8}))?$/i.exec(text||'');
  const postback=/^ahoy:follow:([a-f0-9-]{36})$/.exec(item.postback?.payload||'');
  const eventId=item.message?.mid||item.postback?.mid;
  if((!match&&!postback)||!eventId)return [];
  // A worker can stop during a read-only verification. A later fresh reply can recover it.
  await db().execute({sql:"UPDATE activity SET status='verification-unavailable',reason='Previous follow check was interrupted. Checking again after a fresh interaction.' WHERE status='checking-follow' AND id IN (SELECT activity_id FROM follow_requests WHERE account_id=? AND user_id=? AND check_after<?)",args:[accountId,String(item.sender.id),now-60000]});
  const results=await db().execute({sql:`SELECT f.*,a.status FROM follow_requests f JOIN activity a ON a.id=f.activity_id
    WHERE f.tenant='owner' AND f.account_id=? AND f.user_id=? AND a.status IN ('awaiting-follow','verification-unavailable')
    AND (?='' OR f.activity_id LIKE ?) AND (?='' OR f.activity_id=?) LIMIT 2`,
    args:[accountId,String(item.sender.id),match?.[1]||'',(match?.[1]||'')+'%',postback?.[1]||'',postback?.[1]||'']});
  // An unqualified CHECK must never choose an arbitrary resource among multiple requests.
  if(results.rows.length!==1)return [];
  const row=results.rows[0];
  if(match) await db().execute({sql:'UPDATE follow_requests SET consent_at=max(consent_at,?) WHERE activity_id=?',args:[timestamp,row.activity_id]});
  else if(!row.consent_at||now-Number(row.consent_at)>23*3600000)return [];
  // Postback mid identifies the button message, not necessarily a unique tap.
  // Timestamp distinguishes later taps while duplicate delivery of one tap stays idempotent.
  const interactionId=postback?`postback:${eventId}:${timestamp}`:String(eventId);
  return [{id:row.activity_id,accountId,phase:'follow-check',eventId:interactionId}];
}

export async function checkFollow({id,eventId},now=Date.now()) {
  await init();
  const row=(await db().execute({sql:`SELECT a.*,f.user_id AS recipient_id,f.resource_message,f.profile_url,f.consent_at,f.check_after,f.last_event
    FROM activity a JOIN follow_requests f ON f.activity_id=a.id WHERE a.tenant='owner' AND a.id=?`,args:[id]})).rows[0];
  if(!row)return {skipped:true,skipReason:'request-not-found'};
  if(!followStatuses.includes(row.status))return {skipped:true,skipReason:'request-not-pending'};
  if(!eventId)return {skipped:true,skipReason:'missing-interaction'};
  if(row.last_event===eventId)return {skipped:true,skipReason:'duplicate-interaction'};
  if(Number(row.check_after)>now) {
    const retryAfterMs=Math.min(30000,Number(row.check_after)-now)+250;
    await db().execute({sql:"UPDATE activity SET reason=? WHERE id=? AND status IN ('awaiting-follow','verification-unavailable')",args:['Follow recheck queued. Waiting briefly before checking again; no new reply is needed.',id]});
    return {deferred:true,retryAfterMs};
  }
  if(!row.consent_at||now-Number(row.consent_at)>23*3600000)return status(id,'awaiting-follow','Reply CHECK again in Instagram to open a fresh messaging window.');
  const campaign=(await db().execute({sql:"SELECT data FROM campaigns WHERE tenant='owner' AND id=?",args:[row.campaign_id]})).rows[0];
  const account=(await db().execute({sql:"SELECT * FROM accounts WHERE tenant='owner' AND id=?",args:[row.account_id]})).rows[0];
  const optedOut=(await db().execute({sql:"SELECT 1 FROM opt_outs WHERE tenant='owner' AND account_id=? AND username IN (?,?)",args:[row.account_id,row.user_id,row.recipient_id]})).rows.length;
  if(!campaign||!JSON.parse(campaign.data).active||!account||optedOut)return status(id,'skipped',optedOut?'This person opted out.':'Campaign paused, removed or account disconnected.');
  if(process.env.LIVE_SENDS_ENABLED!=='true')return status(id,'verification-unavailable','Live sends are disabled. Resource withheld.');
  const claim=await db().execute({sql:"UPDATE activity SET status='checking-follow',reason='Checking follow status with Meta.' WHERE id=? AND status IN ('awaiting-follow','verification-unavailable')",args:[id]});
  if(!claim.rowsAffected)return {skipped:true,skipReason:'another-worker-claimed-request'};
  await db().execute({sql:'UPDATE follow_requests SET last_event=?,check_after=? WHERE activity_id=?',args:[eventId,now+30000,id]});
  let token,profile;
  try {token=decrypt(account.token);profile=await graph(`${encodeURIComponent(row.recipient_id)}?fields=is_user_follow_business`,token,{},account.auth_type);}
  catch {return status(id,'verification-unavailable','Meta could not verify follow status for this connection. Resource withheld; reply CHECK again after access is resolved.');}
  if(typeof profile.is_user_follow_business!=='boolean')return status(id,'verification-unavailable','Meta did not return a follow status. Resource withheld.');
  if(profile.is_user_follow_business===false) {
    // This is inside a window established by an actual inbound text message.
    try {await graph(`${account.id}/messages`,token,{method:'POST',body:JSON.stringify({recipient:{id:row.recipient_id},message:{attachment:{type:'template',payload:{template_type:'button',text:`A follow is not visible yet. Follow the profile, then check again. You can also reply CHECK ${id.slice(0,8).toUpperCase()}.`,buttons:[{type:'web_url',url:row.profile_url,title:'Visit profile'},{type:'postback',payload:'ahoy:follow:'+id,title:'Check follow'}]}}}})},account.auth_type);}
    catch {return status(id,'awaiting-follow','Not following yet. Follow the profile and reply CHECK again; recheck buttons could not be delivered.');}
    return status(id,'awaiting-follow','Not following yet. Follow the profile, then tap Check follow or reply CHECK again.');
  }
  // Snapshot the resource before sending; a crash/unknown outcome must never auto-resend it.
  await db().execute({sql:"UPDATE activity SET status='sending-resource',message=?,reason='Follow verified; resource delivery in progress.' WHERE id=?",args:[row.resource_message,id]});
  try {
    await graph(`${account.id}/messages`,token,{method:'POST',body:JSON.stringify({recipient:{id:row.recipient_id},message:{text:row.resource_message}})},account.auth_type);
    return status(id,'sent','Follow verified by Meta; resource delivered.');
  } catch(e) {
    return status(id,'failed',e.httpStatus?'Follow verified; Meta rejected the resource. Check Instagram before starting a new request.':'Resource delivery could not be confirmed. Check Instagram before starting a new request.');
  }
}
