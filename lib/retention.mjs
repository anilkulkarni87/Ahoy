import { db,init } from './db.mjs';
export async function rollupAndPurge() {
 await init();
 return db().batch([
  "INSERT INTO daily_stats(tenant,campaign_id,date,comments,sent) SELECT tenant,COALESCE(campaign_id,''),date(created_at),count(*),sum(CASE WHEN status='sent' THEN 1 ELSE 0 END) FROM activity WHERE date(created_at)<date('now','-30 days') AND julianday(created_at)>=julianday(COALESCE((SELECT analytics_since FROM workspace_settings WHERE tenant=activity.tenant),'1970-01-01')) GROUP BY tenant,COALESCE(campaign_id,''),date(created_at) ON CONFLICT(tenant,campaign_id,date) DO UPDATE SET comments=comments+excluded.comments,sent=sent+excluded.sent",
  "DELETE FROM delivery_metrics WHERE julianday(created_at)<julianday('now','-90 days')",
  "DELETE FROM activity_events WHERE activity_id IN (SELECT id FROM activity WHERE date(created_at)<date('now','-30 days'))",
  "DELETE FROM follow_requests WHERE activity_id IN (SELECT id FROM activity WHERE date(created_at)<date('now','-30 days'))",
  "DELETE FROM activity WHERE date(created_at)<date('now','-30 days')",
  "DELETE FROM webhook_events WHERE dispatched=1 AND date(created_at)<date('now','-30 days')",
  {sql:'DELETE FROM sessions WHERE expires<?',args:[Date.now()]},
  {sql:'DELETE FROM auth_attempts WHERE reset_at<?',args:[Date.now()]},
  {sql:'DELETE FROM auth_tokens WHERE expires<?',args:[Date.now()]}
 ],'write');
}
export async function deleteAccountData(tenant,accountId) {
 if(!tenant||!accountId)throw new Error('An account and workspace are required.');
 await init();
 const related="SELECT id FROM campaigns WHERE tenant=? AND json_extract(data,'$.accountId')=?";
 return db().batch([
  {sql:'DELETE FROM connection_signals WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:'DELETE FROM activity_events WHERE tenant=? AND activity_id IN (SELECT id FROM activity WHERE tenant=? AND account_id=?)',args:[tenant,tenant,accountId]},
  {sql:'DELETE FROM delivery_metrics WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:'DELETE FROM account_button_status WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:`DELETE FROM archived_links WHERE tenant=? AND id IN (SELECT id FROM links WHERE tenant=? AND campaign_id IN (${related}))`,args:[tenant,tenant,tenant,accountId]},
  {sql:`DELETE FROM links WHERE tenant=? AND campaign_id IN (${related})`,args:[tenant,tenant,accountId]},
  {sql:`DELETE FROM daily_stats WHERE tenant=? AND campaign_id IN (${related})`,args:[tenant,tenant,accountId]},
  {sql:'DELETE FROM follow_requests WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:'DELETE FROM activity WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:'DELETE FROM opt_outs WHERE tenant=? AND account_id=?',args:[tenant,accountId]},
  {sql:"DELETE FROM campaigns WHERE tenant=? AND json_extract(data,'$.accountId')=?",args:[tenant,accountId]},
  {sql:'DELETE FROM accounts WHERE tenant=? AND id=?',args:[tenant,accountId]}
 ],'write');
}
