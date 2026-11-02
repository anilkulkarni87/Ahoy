import { createHash } from 'node:crypto';
import { db,init } from './db.mjs';

export const stageLabels={received:'Comment recorded',matched:'Campaign matched',queued:'Reply queued',worker:'Worker started',request:'Follow request accepted by Meta',check:'Follow check received',notFollowing:'Follow not visible yet',unavailable:'Follow verification unavailable',verified:'Follow verified by Meta',resource:'Resource accepted by Meta',failed:'Delivery needs attention',limited:'Meta requested a delay'};
const columns={request:'request_at',check:'check_at',verified:'verified_at',resource:'resource_at'};
const failureCodes=new Set(['paused','disconnected','opt-out','live-off','rate-limit','meta-rejected','unknown-outcome','verification-unavailable','closed']);
export function eventStatement(tenant,id,stage,at=new Date().toISOString()) {
 if(!Object.hasOwn(stageLabels,stage))throw new Error('Unknown delivery milestone.');
 return {sql:'INSERT OR IGNORE INTO activity_events(tenant,activity_id,stage,occurred_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM activity WHERE tenant=? AND id=?)',args:[tenant,id,stage,at,tenant,id]};
}
export function metricStatements(tenant,id,stage,at=new Date().toISOString()) {
 const statements=[eventStatement(tenant,id,stage,at)];
 if(columns[stage])statements.push({sql:`UPDATE delivery_metrics SET ${columns[stage]}=COALESCE(${columns[stage]},?) WHERE tenant=? AND activity_id=?`,args:[at,tenant,id]});
 return statements;
}
export function startMetricStatements({tenant,id,campaignId,accountId,person,gated,createdAt,status,demo,blockedReason=null}) {
 const result=[eventStatement(tenant,id,'received',createdAt)];
 if(!campaignId||(status==='skipped'&&!blockedReason))return result;
 const key=createHash('sha256').update(JSON.stringify([tenant,accountId,String(person)])).digest('hex');
 result.push({sql:'INSERT OR IGNORE INTO delivery_metrics(activity_id,tenant,campaign_id,account_id,person_key,gated,created_at,outcome,outcome_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM activity WHERE tenant=? AND id=?)',args:[id,tenant,campaignId,accountId,key,gated?1:0,createdAt,status,createdAt,tenant,id]},eventStatement(tenant,id,'matched',createdAt));
 if(blockedReason)result.push(outcomeStatement(tenant,id,status,blockedReason));
 else result.push(eventStatement(tenant,id,'queued',createdAt));
 if(demo&&!blockedReason)result.push(...metricStatements(tenant,id,gated?'request':'resource',createdAt));
 return result;
}
export async function recordStage(tenant,id,stage,at) {await db().batch(metricStatements(tenant,id,stage,at),'write');}
export function outcomeStatement(tenant,id,status,code=null) {
 if(code&&!failureCodes.has(code))throw new Error('Unknown delivery outcome.');
 return {sql:'UPDATE delivery_metrics SET outcome=?,failure_code=?,outcome_at=? WHERE tenant=? AND activity_id=?',args:[status,code,new Date().toISOString(),tenant,id]};
}
export function signalStatement(tenant,accountId,kind,status='observed',at=new Date().toISOString()) {
 if(!['access','comment','button','worker','accepted'].includes(kind)||!['observed','ok','failed'].includes(status))throw new Error('Unknown connection signal.');
 return {sql:'INSERT INTO connection_signals(tenant,account_id,kind,status,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(tenant,account_id,kind) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at WHERE julianday(excluded.checked_at)>=julianday(connection_signals.checked_at)',args:[tenant,accountId,kind,status,at]};
}
export async function signal(tenant,accountId,kind,status,at) {await db().execute(signalStatement(tenant,accountId,kind,status,at));}
// Called only after a raw Meta webhook passes signature verification.
export async function observeWebhook(payload,at=new Date().toISOString()) {
 const known=new Set((await db().execute("SELECT id FROM accounts WHERE tenant='owner'")).rows.map(a=>a.id));
 const updates=new Map();
 for(const entry of payload.entry||[]) {
  if(!known.has(String(entry.id)))continue;
  if(entry.changes?.some(c=>c.field==='comments'))updates.set(entry.id+':comment',signalStatement('owner',String(entry.id),'comment','observed',at));
  if(entry.messaging?.some(m=>m.postback?.payload?.startsWith('ahoy:follow:')||m.message?.quick_reply?.payload?.startsWith('ahoy:follow:')))updates.set(entry.id+':button',signalStatement('owner',String(entry.id),'button','observed',at));
 }
 if(updates.size)await db().batch([...updates.values()],'write');
}
export async function activityTimeline(tenant,id) {
 await init();
 const row=(await db().execute({sql:'SELECT id,status,reason,created_at FROM activity WHERE tenant=? AND id=?',args:[tenant,id]})).rows[0];
 if(!row)return null;
 const events=(await db().execute({sql:'SELECT stage,occurred_at FROM activity_events WHERE tenant=? AND activity_id=? ORDER BY julianday(occurred_at),rowid',args:[tenant,id]})).rows;
 return {...row,events:events.map(e=>({...e,label:stageLabels[e.stage]})),completeHistory:events.some(e=>e.stage==='received')};
}
