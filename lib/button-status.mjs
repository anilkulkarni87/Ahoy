import { db, init } from './db.mjs';
import { decrypt } from './core.mjs';
import { graph } from './instagram.mjs';
export async function checkButtonStatus(tenant,account,enable=false,request=graph) {
 await init();let status='unknown';
 try {
  if(enable) {
   const result=await request(`${account.id}/subscribed_apps`,decrypt(account.token),{method:'POST',body:JSON.stringify({subscribed_fields:'comments,messages,messaging_postbacks'})},account.auth_type);
   if(result.success!==true)throw new Error('Meta did not confirm the subscription.');
  }
  const result=await request(`${account.id}/subscribed_apps?fields=id,subscribed_fields`,decrypt(account.token),{},account.auth_type);
  const app=Array.isArray(result.data)?result.data.find(a=>String(a.id)===process.env.META_APP_ID):null;
  if(Array.isArray(result.data))status=app&&Array.isArray(app.subscribed_fields)&&['comments','messages','messaging_postbacks'].every(f=>app.subscribed_fields.includes(f))?'enabled':'not-enabled';
 } catch {status='unknown';}
 const checkedAt=new Date().toISOString();
 await db().execute({sql:'INSERT INTO account_button_status(tenant,account_id,status,checked_at) VALUES(?,?,?,?) ON CONFLICT(tenant,account_id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at',args:[tenant,account.id,status,checkedAt]});
 return {status,checkedAt,message:status==='enabled'?'Meta confirmed this account’s button subscriptions. Also enable messaging_postbacks in the app’s webhook settings.':status==='not-enabled'?'Meta has not confirmed all required subscriptions for this app.':'Could not verify Meta subscriptions. CHECK replies remain available. Try checking again.'};
}
