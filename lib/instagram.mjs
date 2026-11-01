// The login mode is persisted per account: changing setup must not reroute old tokens.
export function loginMode(env=process.env) {
  const mode=env.META_LOGIN_MODE || (env.META_CONFIG_ID?'unified':'instagram');
  if(!['instagram','unified'].includes(mode)) throw new Error('Set META_LOGIN_MODE to unified or instagram.');
  return mode;
}
export function apiVersion(env=process.env) {
  if(!/^v\d+\.\d+$/.test(env.META_API_VERSION||'')) throw new Error('Set a supported META_API_VERSION before connecting Instagram.');
  return env.META_API_VERSION;
}
export function oauthConfig(env=process.env) {
  const mode=loginMode(env);
  if(!/^\d+$/.test(env.META_APP_ID||'')) throw new Error('META_APP_ID must contain digits only, without quotes or spaces.');
  if(!env.META_APP_SECRET?.trim()) throw new Error('Add the matching META_APP_SECRET in your private hosting settings.');
  let url;try {url=new URL(env.APP_URL);}catch {throw new Error('Set APP_URL to your public HTTPS address.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^[\/]*$/.test(url.pathname)) throw new Error('Set APP_URL to your public HTTPS address, without a path, query or fragment.');
  if(mode==='unified'&&!/^\d+$/.test(env.META_CONFIG_ID||'')) throw new Error('Add the numeric META_CONFIG_ID from Meta’s Unified Login configuration, without quotes or spaces.');
  return {mode,clientId:env.META_APP_ID,secret:env.META_APP_SECRET,version:apiVersion(env),redirectUri:url.origin+'/api/instagram/callback',configId:env.META_CONFIG_ID};
}
export function authorizationUrl(state,env=process.env) {
  const c=oauthConfig(env);
  const url=new URL(c.mode==='unified'?'https://www.facebook.com/dialog/oauth':'https://www.instagram.com/oauth/authorize');
  const params={client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',state};
  if(c.mode==='unified') Object.assign(params,{config_id:c.configId,override_default_response_type:'true',prompt:'login'});
  else params.scope='instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments';
  url.search=new URLSearchParams(params);return url;
}
export async function graph(path,token,options={},mode='instagram',env=process.env,fetchImpl=fetch) {
  if(!['instagram','unified'].includes(mode)) throw new Error('Unknown Instagram connection type. Reconnect this account.');
  const host=mode==='unified'?'graph.facebook.com':'graph.instagram.com';
  const response=await fetchImpl(`https://${host}/${apiVersion(env)}/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok||body.error) {const e=new Error('Meta rejected the request. Check account access and permissions, or reconnect.');e.code=body.error?.code;e.httpStatus=response.status;throw e;}
  return body;
}
async function tokenResponse(url,options,fetchImpl) {
  const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok||!body.access_token) throw new Error('Meta could not exchange the login code. Check the app credentials, configuration and exact redirect URI.');
  return body;
}
const requiredUnifiedPermissions=['instagram_basic','instagram_manage_comments','instagram_manage_messages'];
async function discoveryFailure(request,config,shape) {
  // Return only allowlisted flags/statuses. Never return token, profile, IDs or raw provider errors.
  const diagnostics={stage:'shared-account-discovery',apiVersion:config.version,responseShape:shape,accountCount:shape==='empty-list'?0:null,portfolioAccess:'unknown',permissions:{}};
  try {
    const profile=await request('me?fields=id,client_business_id');
    diagnostics.portfolioAccess=profile.client_business_id?'confirmed':'not-returned';
  } catch(e) {diagnostics.portfolioAccess='check-failed';if(Number.isInteger(e.code))diagnostics.portfolioCheckCode=e.code;}
  try {
    const result=await request('me/permissions');
    diagnostics.permissionCheck=Array.isArray(result.data)?'completed':'unexpected-response';
    for(const name of requiredUnifiedPermissions) {
      const status=Array.isArray(result.data)?result.data.find(p=>p.permission===name)?.status:undefined;
      diagnostics.permissions[name]=['granted','declined','expired'].includes(status)?status:'not-returned';
    }
  } catch(e) {diagnostics.permissionCheck='failed';if(Number.isInteger(e.code))diagnostics.permissionCheckCode=e.code;}
  const message=shape==='empty-list'
    ?'Meta returned an empty Instagram account list after login, even if you selected an account. Ahoy has not saved this connection. Share the diagnostic summary below to check the issued token’s portfolio access and permissions.'
    :'Meta returned an unexpected shared-account response. Ahoy has not saved this connection. Share the diagnostic summary below.';
  return Object.assign(new Error(message),{connectionDiagnostics:diagnostics});
}
export async function exchangeConnection(code,env=process.env,fetchImpl=fetch) {
  const c=oauthConfig(env);let result;
  if(c.mode==='unified') {
    const url=new URL(`https://graph.facebook.com/${c.version}/oauth/access_token`);
    url.search=new URLSearchParams({client_id:c.clientId,client_secret:c.secret,redirect_uri:c.redirectUri,code});
    result=await tokenResponse(url,{},fetchImpl);
  } else {
    const short=await tokenResponse('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:c.clientId,client_secret:c.secret,grant_type:'authorization_code',redirect_uri:c.redirectUri,code})},fetchImpl);
    const url=new URL('https://graph.instagram.com/access_token');
    url.search=new URLSearchParams({grant_type:'ig_exchange_token',client_secret:c.secret,access_token:short.access_token});
    result=await tokenResponse(url,{},fetchImpl);
  }
  const token=result.access_token;
  const request=(path,options)=>graph(path,token,options,c.mode,env,fetchImpl);
  const profiles=[];
  if(c.mode==='unified') {
    // A system-user token represents a portfolio integration, not the Instagram profile.
    const ids=new Set();let cursor;
    for(let page=0;page<100;page++) {
      const params=new URLSearchParams({fields:'id',limit:'100'});if(cursor)params.set('after',cursor);
      const list=await request('me/assigned_instagram_accounts?'+params);
      if(!Array.isArray(list?.data))throw await discoveryFailure(request,c,'unexpected');
      for(const a of list.data) {if(!/^\d+$/.test(String(a.id)))throw new Error('Meta returned an invalid Instagram account.');ids.add(String(a.id));}
      if(!list.paging?.next)break;
      const next=list.paging.cursors?.after;
      if(!next||next===cursor||page===99)throw new Error('Could not list all shared accounts. Reconnect and share fewer accounts.');
      cursor=next;
    }
    if(!ids.size)throw await discoveryFailure(request,c,'empty-list');
    for(const id of ids)profiles.push(await request(id+'?fields=id,username'));
  } else profiles.push(await request('me?fields=user_id,username'));
  const expiresAt=Number(result.expires_in)>0?new Date(Date.now()+Number(result.expires_in)*1000).toISOString():null;
  const accounts=profiles.map(p=>({id:String(p.user_id||p.id),username:p.username,token,expiresAt,authType:c.mode}));
  if(accounts.some(a=>!/^\d+$/.test(a.id)||!a.username))throw new Error('Meta did not return the selected Instagram profile. Check basic account permissions.');
  for(const a of accounts) {
    const subscription=await request(`${a.id}/subscribed_apps`,{method:'POST',body:JSON.stringify({subscribed_fields:'comments,messages'})});
    if(subscription.success!==true)throw new Error('Meta did not confirm webhook subscriptions. Check comment and messaging permissions and connect again.');
  }
  return accounts;
}
export function commentValue(value) {
  if(!value)return null;
  return {...value,id:value.id||value.comment_id};
}
