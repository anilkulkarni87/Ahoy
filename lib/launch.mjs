import { db, init } from './db.mjs';
import { createHash } from 'node:crypto';
const pending="'queued','rate-limited','awaiting-follow','verification-unavailable'";
export async function launchPreview(tenant) {
 await init();
 const tx=await db().transaction('read');
 try {
  const result={};
  for(const [key,sql] of Object.entries({campaigns:'SELECT count(*) AS n FROM campaigns WHERE tenant=?',activity:'SELECT count(*) AS n FROM activity WHERE tenant=?',pending:`SELECT count(*) AS n FROM activity WHERE tenant=? AND status IN (${pending})`,inFlight:"SELECT count(*) AS n FROM activity WHERE tenant=? AND status IN ('sending','sending-resource','checking-follow')"}))result[key]=Number((await tx.execute({sql,args:[tenant]})).rows[0].n);
  result.analyticsSince=(await tx.execute({sql:'SELECT analytics_since FROM workspace_settings WHERE tenant=?',args:[tenant]})).rows[0]?.analytics_since||null;
  result.fingerprint=createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return result;
 } finally {await tx.rollback();tx.close();}
}
export async function prepareLaunch(tenant,confirmation,fingerprint) {
 if(confirmation!=='PREPARE')throw new Error('Type PREPARE to confirm.');
 await init();
 const tx=await db().transaction('write');
 try {
  // Lock first: no delivery can claim a record while the launch boundary changes.
  const current={};
  for(const [key,sql] of Object.entries({campaigns:'SELECT count(*) AS n FROM campaigns WHERE tenant=?',activity:'SELECT count(*) AS n FROM activity WHERE tenant=?',pending:`SELECT count(*) AS n FROM activity WHERE tenant=? AND status IN (${pending})`,inFlight:"SELECT count(*) AS n FROM activity WHERE tenant=? AND status IN ('sending','sending-resource','checking-follow')"}))current[key]=Number((await tx.execute({sql,args:[tenant]})).rows[0].n);
  current.analyticsSince=(await tx.execute({sql:'SELECT analytics_since FROM workspace_settings WHERE tenant=?',args:[tenant]})).rows[0]?.analytics_since||null;
  if(current.inFlight)throw new Error('A delivery or follow check is running. Wait for it to finish, then refresh the preview.');
  if(createHash('sha256').update(JSON.stringify(current)).digest('hex')!==fingerprint)throw new Error('Workspace changed. Refresh the preview before confirming.');
  const since=new Date().toISOString();
  await tx.execute({sql:"UPDATE campaigns SET data=json_set(data,'$.active',json('false')) WHERE tenant=?",args:[tenant]});
  await tx.execute({sql:`UPDATE activity SET status='skipped',reason='Closed when preparing for launch.' WHERE tenant=? AND status IN (${pending})`,args:[tenant]});
  await tx.execute({sql:"UPDATE delivery_metrics SET outcome='skipped',failure_code='closed',outcome_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant=? AND activity_id IN (SELECT id FROM activity WHERE tenant=? AND reason='Closed when preparing for launch.')",args:[tenant,tenant]});
  await tx.execute({sql:'INSERT OR IGNORE INTO archived_links(tenant,id) SELECT tenant,id FROM links WHERE tenant=?',args:[tenant]});
  await tx.execute({sql:'INSERT INTO workspace_settings(tenant,analytics_since) VALUES(?,?) ON CONFLICT(tenant) DO UPDATE SET analytics_since=excluded.analytics_since',args:[tenant,since]});
  await tx.commit();return {ok:true,analyticsSince:since};
 } catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
export async function launchBoundary(tenant) {
 await init();return (await db().execute({sql:'SELECT analytics_since FROM workspace_settings WHERE tenant=?',args:[tenant]})).rows[0]?.analytics_since||null;
}
export function beforeLaunch(timestamp,boundary) {
 return !!boundary&&(typeof timestamp!=='string'||!timestamp||!Number.isFinite(Date.parse(timestamp))||Date.parse(timestamp.includes('T')?timestamp:timestamp.replace(' ','T')+'Z')<Date.parse(boundary));
}
