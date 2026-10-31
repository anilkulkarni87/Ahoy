import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { storageConfig } from './storage.mjs';
let ready;
export function db() {
  if (!globalThis.ahoyDb) {
    const config=storageConfig();
    if(config.directory)mkdirSync(config.directory,{recursive:true});
    globalThis.ahoyDb=createClient({url:config.url,authToken:config.authToken});
  }
  return globalThis.ahoyDb;
}
export async function init() {
  if (!ready) ready = db().batch([
    `CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, campaign_id TEXT, comment_id TEXT NOT NULL, username TEXT NOT NULL, comment TEXT NOT NULL, message TEXT, account_id TEXT, user_id TEXT, status TEXT NOT NULL, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant,comment_id))`,
    `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, username TEXT NOT NULL, token TEXT NOT NULL, expires_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS opt_outs (tenant TEXT NOT NULL, account_id TEXT NOT NULL, username TEXT NOT NULL, PRIMARY KEY(tenant,account_id,username))`,
    `CREATE TABLE IF NOT EXISTS waitlist (email TEXT PRIMARY KEY, use_case TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS setup_requests (id TEXT PRIMARY KEY, email TEXT NOT NULL, details TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS auth_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, campaign_id TEXT NOT NULL, url TEXT NOT NULL, clicks INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, dispatched INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS activity_tenant_date ON activity(tenant,created_at)`,
    `CREATE TABLE IF NOT EXISTS daily_stats (tenant TEXT NOT NULL, campaign_id TEXT NOT NULL, date TEXT NOT NULL, comments INTEGER DEFAULT 0, sent INTEGER DEFAULT 0, PRIMARY KEY(tenant,campaign_id,date))`
  ],'write').catch(e=>{ready=null;throw e;});
  await ready;
  const columns=(await db().execute('PRAGMA table_info(activity)')).rows.map(r=>r.name);
  for(const column of ['account_id','user_id']) if(!columns.includes(column)) {
    try {await db().execute(`ALTER TABLE activity ADD COLUMN ${column} TEXT`);} catch(e) {if(!String(e.message).includes('duplicate column'))throw e;}
  }
}
export async function query(tenant,sql,args=[]) {
  if (!tenant) throw new Error('Workspace is required.');
  await init(); return db().execute({sql,args:[tenant,...args]});
}
export async function campaigns(tenant) { return (await query(tenant,'SELECT * FROM campaigns WHERE tenant=? ORDER BY datetime(created_at) DESC')).rows.map(r=>({...JSON.parse(r.data),id:r.id})); }
export async function seed(tenant) {
  if ((await campaigns(tenant)).length) return;
  const samples=[{id:'demo-guide',name:'The slow Sunday guide',keywords:['SUNDAY','guide'],dmTemplate:'Hey {username}! So glad you’re making a little room for yourself. Here’s your slow Sunday guide 🌿',publicReply:'A little something is waiting in your DMs 🌿',triggerType:'specific',mediaId:'post-1',linkUrl:'https://example.com/sunday-guide',active:true,matchMode:'contains',ignoreCase:true},{id:'demo-studio',name:'A little studio tour',keywords:['STUDIO'],dmTemplate:'Ahoy, {username}! Come on in. Here are all the details from my little creative corner.',publicReply:'Just sent it your way!',triggerType:'specific',mediaId:'post-2',linkUrl:'https://example.com/studio',active:true,matchMode:'contains',ignoreCase:true},{id:'demo-favorites',name:'October favourites',keywords:['LINK','favourites'],dmTemplate:'Hey {username}, here are a few things I’ve been loving lately. Hope you find something you love too ♡',publicReply:'Check your inbox ♡',triggerType:'any',mediaId:'',linkUrl:'https://example.com/favourites',active:false,matchMode:'contains',ignoreCase:true}];
  await init();
  await db().batch(samples.map(c=>({sql:'INSERT OR IGNORE INTO campaigns (id,tenant,data) VALUES (?,?,?)',args:[tenant+':'+c.id,tenant,JSON.stringify(c)]})),'write');
  const rows=[['maya.reads','SUNDAY please 🌿','demo-guide','sent',null],['hello.jules','This is just what I needed. Guide please!','demo-guide','sent',null],['oliver.makes','STUDIO! Love this space','demo-studio','sent',null],['ella.and.co','Such a beautiful light ☀','demo-guide','skipped','No keyword matched.'],['nina.studio','Sunday 💚','demo-guide','sent',null],['the.weekend.edit','Could you send the GUIDE?','demo-guide','sent',null],['milo.creates','STUDIO please','demo-studio','sent',null]];
  await db().batch(rows.map((r,i)=>({sql:'INSERT OR IGNORE INTO activity (id,tenant,campaign_id,comment_id,username,comment,status,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)',args:[randomUUID(),tenant,tenant+':'+r[2],tenant+':seed-'+i,r[0],r[1],r[3],r[4],new Date(Date.now()-i*900000).toISOString()]})),'write');
}
