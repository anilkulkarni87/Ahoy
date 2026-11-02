import { signal } from './observability.mjs';
import { checkFollow, followChecks } from './follow.mjs';
import { commentValue } from './instagram.mjs';
import { Inngest } from 'inngest';
import { deliver, processComment, meta } from './engine.mjs';
import { db, init } from './db.mjs';
import { rollupAndPurge } from './retention.mjs';
import { decrypt, encrypt, optedOut } from './core.mjs';
export const inngest=new Inngest({id:'ahoy',eventKey:process.env.INNGEST_EVENT_KEY});
export async function runDelivery({event,step},verify=checkFollow) {
  if(event.data.phase!=='follow-check')return step.run('send-private-reply',()=>deliver(event.data.id));
  for(let attempt=0;attempt<3;attempt++) {
    const result=await step.run(attempt?'follow-recheck-'+attempt:'send-private-reply',()=>verify(event.data));
    console.info('Ahoy follow check result',{status:result.status||null,deferred:result.deferred===true,skipReason:result.skipReason||null});
    if(!result.deferred)return result;
    // Durable sleep: release the function rather than holding a Vercel request open.
    if(attempt<2)await step.sleep('follow-cooldown-'+attempt,result.retryAfterMs);
  }
  return step.run('follow-check-busy',async()=>{
    await db().execute({sql:"UPDATE activity SET reason=? WHERE id=? AND status IN ('awaiting-follow','verification-unavailable')",args:['Other checks are still pending. Wait a minute and tap Check follow again.',event.data.id]});
    return {deferred:true,reason:'other-checks-pending'};
  });
}
export const delivery=inngest.createFunction({id:'deliver-comment',retries:4,concurrency:{limit:1,key:'event.data.accountId'},throttle:{limit:Number(process.env.ACCOUNT_HOURLY_LIMIT)||200,period:'1h',key:'event.data.accountId'},triggers:{event:'ahoy/comment.ready'}},runDelivery);
export async function dispatchEvent(eventId,payload) {
  for(const entry of payload.entry||[]) {
    const account=(await db().execute({sql:'SELECT id FROM accounts WHERE tenant=? AND id=?',args:['owner',entry.id]})).rows[0];
    if(!account)continue;
    await signal('owner',String(entry.id),'worker');
    for(const item of entry.messaging||[]) {
      if(item.sender?.id && !item.message?.is_echo && item.message?.text && optedOut(item.message.text)) await db().batch([
        {sql:'INSERT OR IGNORE INTO opt_outs(tenant,account_id,username) VALUES(?,?,?)',args:['owner',entry.id,String(item.sender.id)]},
        // Preserve opt-outs when Meta uses different comment and messaging identifiers.
        {sql:"INSERT OR IGNORE INTO opt_outs(tenant,account_id,username) SELECT a.tenant,a.account_id,a.user_id FROM activity a JOIN follow_requests f ON f.activity_id=a.id WHERE f.tenant='owner' AND f.account_id=? AND f.user_id=?",args:[entry.id,String(item.sender.id)]}
      ],'write');
      const checks=await followChecks(entry.id,item);
      if(item.postback?.payload?.startsWith('ahoy:follow:')||item.message?.quick_reply?.payload?.startsWith('ahoy:follow:'))console.info('Ahoy follow button received',{eligibleChecks:checks.length});
      for(const check of checks) {
        await inngest.send({id:'follow:'+entry.id+':'+check.eventId,name:'ahoy/comment.ready',data:check});
        console.info('Ahoy follow check queued');
      }
    }
    for(const change of entry.changes||[]) {
    if(change.field!=='comments') continue;
    const v=commentValue(change.value);
    if(!v?.id || !v?.from?.id || v.from.id===entry.id) continue;

    const result=await processComment('owner',{commentId:v.id,username:v.from.username||String(v.from.id),userId:String(v.from.id),text:v.text||'',timestamp:v.timestamp||(entry.time?new Date(Number(entry.time)*1000).toISOString():null),mediaId:v.media?.id,accountId:entry.id});
    if(result.status==='queued') await inngest.send({id:'comment:'+result.id,name:'ahoy/comment.ready',data:{id:result.id,accountId:entry.id}});
  }
  }
  await db().execute({sql:'UPDATE webhook_events SET dispatched=1 WHERE id=?',args:[eventId]});
}
export const ingest=inngest.createFunction({id:'ingest-webhook',retries:3,triggers:{event:'ahoy/webhook.received'}},async({event,step})=>step.run('match-comments',async()=>{await init();const row=(await db().execute({sql:'SELECT * FROM webhook_events WHERE id=?',args:[event.data.id]})).rows[0];if(row&&!row.dispatched)await dispatchEvent(row.id,JSON.parse(row.payload));}));
export const reconcile=inngest.createFunction({id:'reconcile',retries:2,triggers:{cron:'*/15 * * * *'}},async({step})=>{
  await init();
  await step.run('recover-undispatched-events',async()=>{
    const rows=(await db().execute('SELECT * FROM webhook_events WHERE dispatched=0 LIMIT 100')).rows;
    for(const row of rows) await dispatchEvent(row.id,JSON.parse(row.payload));
  });
  await step.run('recover-queued-deliveries',async()=>{
    const rows=(await db().execute("SELECT a.id,c.data FROM activity a JOIN campaigns c ON a.campaign_id=c.id WHERE a.tenant='owner' AND a.status IN ('queued','rate-limited') LIMIT 100")).rows;
    for(const r of rows) await inngest.send({id:'comment:'+r.id,name:'ahoy/comment.ready',data:{id:r.id,accountId:JSON.parse(r.data).accountId}});
  });
  await step.run('sweep-recent-comments',async()=>{
    const accounts=(await db().execute("SELECT * FROM accounts WHERE tenant='owner'")).rows;
    for(const a of accounts) {
      const token=decrypt(a.token);
      const media=await meta(`${a.id}/media?fields=id&limit=25`,token,{},a.auth_type);
      for(const post of media.data||[]) {
        const comments=await meta(`${post.id}/comments?fields=id,text,from,timestamp&limit=100`,token,{},a.auth_type);
        for(const v of comments.data||[]) {
          if(v.from?.id===a.id || !v.from?.username || Date.now()-Date.parse(v.timestamp)>6*86400000) continue;
          const result=await processComment('owner',{commentId:v.id,username:v.from.username||String(v.from.id),userId:String(v.from.id),text:v.text||'',timestamp:v.timestamp,mediaId:post.id,accountId:a.id});
          if(result.status==='queued') await inngest.send({id:'comment:'+result.id,name:'ahoy/comment.ready',data:{id:result.id,accountId:a.id}});
        }
      }
    }
  });
});
export const maintenance=inngest.createFunction({id:'daily-maintenance',retries:2,triggers:{cron:'0 3 * * *'}},async({step})=>{
  await init();
  await step.run('roll-up-and-purge',rollupAndPurge);
  await step.run('refresh-tokens',async()=>{
    const accounts=(await db().execute("SELECT * FROM accounts WHERE tenant='owner' AND auth_type='instagram' AND expires_at<datetime('now','+10 days')")).rows;
    for(const a of accounts) {
      const response=await fetch('https://graph.instagram.com/refresh_access_token?'+new URLSearchParams({grant_type:'ig_refresh_token',access_token:decrypt(a.token)}),{signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok||!result.access_token) throw new Error('Instagram token refresh failed. Reconnect your account.');
      await db().execute({sql:'UPDATE accounts SET token=?,expires_at=? WHERE id=? AND tenant=?',args:[encrypt(result.access_token),new Date(Date.now()+result.expires_in*1000).toISOString(),a.id,'owner']});
    }
  });
});
