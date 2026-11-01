import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';
process.env.APP_URL='http://localhost:3000';
process.env.DEMO_MODE='false';
process.env.ADMIN_TOKEN='test-only-secret-'.repeat(4);
const {db,init}=await import('../lib/db.mjs');
const {hash,identity}=await import('../lib/auth.mjs');
const {adminSignIn,authOptions,adminTokenConfigured}=await import('../lib/admin-auth.mjs');
const token=process.env.ADMIN_TOKEN;
const request=ip=>new Request('http://localhost:3000/api/auth/admin',{headers:{'x-forwarded-for':ip}});
await init();
test('token-only setup does not need Resend or an owner email',()=>{
 assert.deepEqual(authOptions({ADMIN_TOKEN:token,DEMO_MODE:'false'}),{adminToken:true,email:false,demo:false});
 assert.equal(authOptions({OWNER_EMAIL:'test@example.com',RESEND_API_KEY:'test',EMAIL_FROM:'test@example.com'}).email,true);
 assert.equal(adminTokenConfigured({ADMIN_TOKEN:'short'}),false);assert.equal(adminTokenConfigured({ADMIN_TOKEN:' '+token}),false);
});
test('correct token creates an opaque hashed session and owner access; rotation revokes it',async()=>{
 const session=await adminSignIn(request('correct'),token);assert.notEqual(session,token);assert.match(session,/^[a-f0-9]{64}$/);
 const row=(await db().execute({sql:'SELECT * FROM sessions WHERE hash=?',args:[hash(session)]})).rows[0];assert.equal(row.auth_method,'admin-token');assert.equal(row.credential_hash,hash(token));assert.equal(JSON.stringify(row).includes(token),false);
 const req=new Request('http://localhost:3000/api/state',{headers:{cookie:'ahoy_session='+session}});
 assert.equal((await identity(req)).tenant,'owner');
 process.env.ADMIN_TOKEN='different-secret-'.repeat(4);assert.equal(await identity(req),null);
 delete process.env.ADMIN_TOKEN;assert.equal(await identity(req),null);process.env.ADMIN_TOKEN=token;
});
test('wrong or malformed tokens never create a session',async()=>{
 const before=(await db().execute('SELECT count(*) AS n FROM sessions')).rows[0].n;
 for(const value of ['wrong',null,{},'a'.repeat(257)])await assert.rejects(()=>adminSignIn(request('wrong'),value),e=>e.status===401&&!e.message.includes(token));
 assert.equal((await db().execute('SELECT count(*) AS n FROM sessions')).rows[0].n,before);
});
test('repeated guesses are throttled in the database and recover after the window',async()=>{
 for(let i=0;i<10;i++)await assert.rejects(()=>adminSignIn(request('limited'),'wrong'),e=>e.status===401);
 await assert.rejects(()=>adminSignIn(request('limited'),token),e=>e.status===429);
 await db().execute({sql:'UPDATE auth_attempts SET reset_at=0 WHERE key=?',args:[hash('admin-login:limited')]});
 assert.ok(await adminSignIn(request('limited'),token));
});
test('unconfigured token and public HTTP fail closed',async()=>{
 await assert.rejects(()=>adminSignIn(request('missing'),token,{APP_URL:'https://example.com'}),e=>e.status===503);
 await assert.rejects(()=>adminSignIn(request('http'),token,{ADMIN_TOKEN:token,APP_URL:'http://example.com'}),/HTTPS/);
});
test('existing email sessions keep working independently of ADMIN_TOKEN',async()=>{
 await db().execute({sql:'INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)',args:[hash('email-session'),'owner@example.com',Date.now()+60000]});
 const req=new Request('http://localhost:3000',{headers:{cookie:'ahoy_session=email-session'}});
 assert.equal((await identity(req)).email,'owner@example.com');
});
