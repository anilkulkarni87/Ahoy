import { randomBytes, createHash } from 'node:crypto';
import { db, init } from './db.mjs';
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function identity(request) {
  await init();
  const cookies=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')));
  if(cookies.ahoy_session) { const row=(await db().execute({sql:'SELECT * FROM sessions WHERE hash=? AND expires>?',args:[hash(cookies.ahoy_session),Date.now()]})).rows[0]; if(row) return {tenant:'owner',email:row.email,demo:false}; }
  if(process.env.DEMO_MODE!=='false') {
    const id=cookies.ahoy_demo;
    if(id && /^[a-f0-9]{32}$/.test(id)) return {tenant:'demo:'+id,demo:true};
  }
  return null;
}
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if (!origin) return true;
  try {
    if (process.env.APP_URL) return origin === new URL(process.env.APP_URL).origin;
    return new URL(origin).host === request.headers.get('host');
  } catch { return false; }
}
export function demoCookie() { return `ahoy_demo=${randomBytes(16).toString('hex')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`; }
