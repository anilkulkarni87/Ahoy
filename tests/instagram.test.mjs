import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationUrl,oauthConfig,exchangeConnection,graph,commentValue} from '../lib/instagram.mjs';
const env={META_APP_ID:'123',META_APP_SECRET:'private-test-secret',META_CONFIG_ID:'456',META_API_VERSION:'v99.0',APP_URL:'https://ahoy.example/'};
const response=body=>new Response(JSON.stringify(body));
test('Unified authorization uses configuration instead of scopes and normalizes callback',()=>{
 const url=authorizationUrl('unified.test',env);
 assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.searchParams.get('config_id'),'456');assert.equal(url.searchParams.has('scope'),false);assert.equal(url.searchParams.get('override_default_response_type'),'true');assert.equal(url.searchParams.get('redirect_uri'),'https://ahoy.example/api/instagram/callback');assert.equal(url.searchParams.get('state'),'unified.test');
});
test('existing Instagram Login installations keep their login flow',()=>{
 const url=authorizationUrl('instagram.test',{...env,META_CONFIG_ID:''});assert.equal(url.origin,'https://www.instagram.com');assert.match(url.searchParams.get('scope'),/instagram_business_manage_comments/);assert.equal(url.searchParams.has('config_id'),false);
});
test('bad copied credentials and missing configuration fail before redirect',()=>{
 assert.throws(()=>oauthConfig({...env,META_APP_ID:'“123”'}),/digits only/);
 assert.throws(()=>oauthConfig({...env,META_LOGIN_MODE:'unified',META_CONFIG_ID:''}),/META_CONFIG_ID/);
 for(const APP_URL of ['http://ahoy.example','https://ahoy.example/subpath','https://ahoy.example/?x=1'])assert.throws(()=>oauthConfig({...env,APP_URL}));
});
test('Unified exchange discovers every assigned account, subscribes, and preserves token expiry',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  url=new URL(url);calls.push({url,options});
  if(url.pathname.endsWith('/oauth/access_token'))return response({access_token:'unified-test-token'});
  assert.equal(options.headers.Authorization,'Bearer unified-test-token');
  if(url.pathname.endsWith('/assigned_instagram_accounts'))return url.searchParams.has('after')?response({data:[{id:'222'}]}):response({data:[{id:'111'}],paging:{next:'https://untrusted.example/ignored',cursors:{after:'next-page'}}});
  if(url.pathname.endsWith('/subscribed_apps'))return response({success:true});
  return response({id:url.pathname.split('/').at(-1),username:'studio'});
 };
 const accounts=await exchangeConnection('one-use-code',env,fetchImpl);
 assert.deepEqual(accounts.map(a=>a.id),['111','222']);assert.ok(accounts.every(a=>a.authType==='unified'&&a.expiresAt===null));assert.ok(calls.every(c=>c.url.host==='graph.facebook.com'));assert.equal(calls.filter(c=>c.url.pathname.endsWith('/subscribed_apps')).length,2);assert.equal(calls[0].url.searchParams.get('redirect_uri'),'https://ahoy.example/api/instagram/callback');
});
test('empty assignment and failed exchange do not create an apparent connection or expose secrets',async()=>{
 await assert.rejects(()=>exchangeConnection('code',env,async url=>response(String(url).includes('/oauth/access_token')?{access_token:'token'}:{data:[]})),/empty Instagram account list/);
 await assert.rejects(()=>exchangeConnection('code',env,async()=>new Response(JSON.stringify({error:{message:'secret-provider-payload'}}),{status:400})),e=>!e.message.includes('secret-provider-payload')&&/exchange/.test(e.message));
});
test('graph host follows each stored account mode rather than current setup',async()=>{
 const hosts=[];const fetchImpl=async url=>{hosts.push(new URL(url).host);return response({id:'111'});};
 await graph('111','token',{},'instagram',env,fetchImpl);await graph('222','token',{},'unified',env,fetchImpl);
 assert.deepEqual(hosts,['graph.instagram.com','graph.facebook.com']);
});
test('both Meta comment formats produce the same comment identity for deduplication',()=>{
 assert.equal(commentValue({comment_id:'comment',text:'GUIDE'}).id,'comment');assert.equal(commentValue({id:'comment',text:'GUIDE'}).id,'comment');
});
test('Instagram Login retains its long-lived exchange and explicit profile lookup',async()=>{
 const urls=[];const fetchImpl=async(url,options)=>{url=new URL(url);urls.push(url);if(url.host==='api.instagram.com'){assert.equal(options.body.get('grant_type'),'authorization_code');return response({access_token:'short'});}if(url.pathname==='/access_token')return response({access_token:'long',expires_in:3600});if(url.pathname.endsWith('/subscribed_apps'))return response({success:true});return response({user_id:'1234',username:'legacy'});};
 const accounts=await exchangeConnection('code',{...env,META_LOGIN_MODE:'instagram'},fetchImpl);
 assert.equal(accounts[0].id,'1234');assert.equal(accounts[0].authType,'instagram');assert.ok(accounts[0].expiresAt);assert.equal(urls[0].host,'api.instagram.com');assert.ok(urls.slice(1).every(u=>u.host==='graph.instagram.com'));
});
test('a refused webhook subscription fails the connection instead of claiming success',async()=>{
 const fetchImpl=async url=>{url=new URL(url);if(url.pathname.endsWith('/oauth/access_token'))return response({access_token:'token',expires_in:3600});if(url.pathname.endsWith('/assigned_instagram_accounts'))return response({data:[{id:'111'}]});if(url.pathname.endsWith('/subscribed_apps'))return response({success:false});return response({id:'111',username:'studio'});};
 await assert.rejects(()=>exchangeConnection('code',env,fetchImpl),/webhook subscriptions/);
});

test('empty discovery reports safe portfolio and permission checks instead of blaming account selection',async()=>{
 const fetchImpl=async url=>{url=new URL(url);
  if(url.pathname.endsWith('/oauth/access_token'))return response({access_token:'private-issued-token'});
  if(url.pathname.endsWith('/assigned_instagram_accounts'))return response({data:[]});
  if(url.pathname.endsWith('/permissions'))return response({data:[{permission:'instagram_basic',status:'granted'},{permission:'instagram_manage_comments',status:'declined'},{permission:'private-other-scope',status:'provider-private-data'}]});
  return response({id:'private-user-id',client_business_id:'private-business-id'});
 };
 await assert.rejects(()=>exchangeConnection('private-code',env,fetchImpl),e=>{
  assert.equal(e.connectionDiagnostics.responseShape,'empty-list');assert.equal(e.connectionDiagnostics.accountCount,0);assert.equal(e.connectionDiagnostics.portfolioAccess,'confirmed');
  assert.deepEqual(e.connectionDiagnostics.permissions,{instagram_basic:'granted',instagram_manage_comments:'declined',instagram_manage_messages:'not-returned'});
  const safe=JSON.stringify(e.connectionDiagnostics);for(const privateValue of ['private-issued-token','private-code','private-user-id','private-business-id',env.META_APP_SECRET,'private-other-scope','provider-private-data'])assert.equal(safe.includes(privateValue),false);
  return true;
 });
});
test('missing data is reported as an unexpected response rather than an empty assignment',async()=>{
 const fetchImpl=async url=>response(String(url).includes('/oauth/access_token')?{access_token:'private-token'}:{unrecognized:'private-provider-payload'});
 await assert.rejects(()=>exchangeConnection('code',env,fetchImpl),e=>e.connectionDiagnostics.responseShape==='unexpected'&&e.connectionDiagnostics.accountCount===null&&!JSON.stringify(e.connectionDiagnostics).includes('private-provider-payload'));
});
test('failed diagnostic probes preserve the discovery error and disclose only numeric error codes',async()=>{
 const fetchImpl=async url=>{url=new URL(url);if(url.pathname.endsWith('/oauth/access_token'))return response({access_token:'private-token'});if(url.pathname.endsWith('/assigned_instagram_accounts'))return response({data:[]});return new Response(JSON.stringify({error:{code:100,message:'private-provider-payload'}}),{status:400});};
 await assert.rejects(()=>exchangeConnection('code',env,fetchImpl),e=>e.connectionDiagnostics.portfolioCheckCode===100&&e.connectionDiagnostics.permissionCheckCode===100&&!JSON.stringify(e.connectionDiagnostics).includes('private-provider-payload'));
});
