import { diagnostics } from '../lib/diagnostics.mjs';
import { init,db } from '../lib/db.mjs';
import {meta} from '../lib/engine.mjs';
import {decrypt} from '../lib/core.mjs';
console.log('\nAhoy · a friendly setup check\n');
let accounts=[],failures=0;
try {await init();accounts=(await db().execute("SELECT * FROM accounts WHERE tenant='owner'")).rows; console.log('✓ Database connection works.');} catch {failures++;console.log('✗ Could not open the database. Check DATABASE_URL and DATABASE_AUTH_TOKEN.');}
for(const check of diagnostics(accounts.length)) {console.log(`${check.ok?'✓':'○'} ${check.name}`);if(!check.ok){console.log('  '+check.detail);failures++;}}
for(const account of accounts){try{await meta(`${account.id}?fields=id,username`,decrypt(account.token),{},account.auth_type);console.log('✓ Instagram token works for @'+account.username);}catch{failures++;console.log('✗ Reconnect @'+account.username+' and check your Meta settings.');}}
if(process.env.APP_URL?.startsWith('https://')&&process.env.META_VERIFY_TOKEN){try{const url=new URL('/api/webhook',process.env.APP_URL);url.search=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':process.env.META_VERIFY_TOKEN,'hub.challenge':'ahoy-doctor'});const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok||await response.text()!=='ahoy-doctor')throw Error();console.log('✓ Public webhook verification works.');}catch{failures++;console.log('✗ Public webhook verification failed. Check the deployed URL and verify token.');}}
console.log('\n'+(failures?'A few things still need your care. The demo is ready to explore.':'Configuration looks ready. Complete a real comment-to-DM test before launch.'));
console.log('This check does not certify Meta permissions, app approval or an Inngest sync.\n');
process.exitCode=failures?1:0;
