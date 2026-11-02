import {createHash} from 'node:crypto';
import {db,init} from './db.mjs';
export async function rateLimit(request,scope,limit=20,windowMs=900000,now=Date.now()) {
 await init();
 // Hosting must supply a trusted forwarded address; never persist the address itself.
 const address=(request.headers.get('x-forwarded-for')||'local').split(',')[0].trim().slice(0,128);
 const key=createHash('sha256').update(scope+':'+address).digest('hex');
 const row=(await db().execute({sql:`INSERT INTO auth_attempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING attempts`,args:[key,now+windowMs,now,now]})).rows[0];
 if(Number(row.attempts)>limit)throw Object.assign(new Error('Too many requests. Wait a few minutes and try again.'),{status:429});
}
