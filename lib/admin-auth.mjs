import { randomBytes,timingSafeEqual } from 'node:crypto';
import { db,init } from './db.mjs';
import { hash } from './auth.mjs';
import { signInBaseUrl } from './email-auth.mjs';
export function adminTokenConfigured(env=process.env) {
  return /^[A-Za-z0-9_-]{32,256}$/.test(env.ADMIN_TOKEN||'');
}
export function authOptions(env=process.env) {
  return {adminToken:adminTokenConfigured(env),email:!!(env.OWNER_EMAIL&&env.RESEND_API_KEY&&env.EMAIL_FROM),demo:env.DEMO_MODE!=='false'};
}
function failure(message,status) {return Object.assign(new Error(message),{status});}
export async function adminSignIn(request,token,env=process.env) {
  if(!adminTokenConfigured(env))throw failure('Admin sign-in is not configured. Set ADMIN_TOKEN to a generated secret of 32–256 letters, digits, underscores or hyphens, then redeploy.',503);
  signInBaseUrl(env); // HTTPS for public sites; loopback HTTP is allowed locally.
  await init();
  // Persist throttling so it also applies across Vercel instances. Never store raw IPs.
  const ip=(request.headers.get('x-forwarded-for')||'local').split(',')[0].trim().slice(0,128);
  const key=hash('admin-login:'+ip);const now=Date.now();
  const attempt=(await db().execute({sql:`INSERT INTO auth_attempts(key,attempts,reset_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING attempts`,args:[key,now+15*60000,now,now]})).rows[0];
  if(attempt.attempts>10)throw failure('Too many sign-in attempts. Wait 15 minutes and try again.',429);
  if(typeof token!=='string'||token.length>256||!timingSafeEqual(Buffer.from(hash(token)),Buffer.from(hash(env.ADMIN_TOKEN))))throw failure('That admin token did not match. Try again.',401);
  const session=randomBytes(32).toString('hex');
  await db().execute({sql:'INSERT INTO sessions(hash,email,expires,auth_method,credential_hash) VALUES(?,?,?,?,?)',args:[hash(session),'',now+7*86400000,'admin-token',hash(env.ADMIN_TOKEN)]});
  await db().execute({sql:'DELETE FROM auth_attempts WHERE key=?',args:[key]});
  return session;
}
