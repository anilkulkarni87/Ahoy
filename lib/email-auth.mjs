// Only loopback development may use plain HTTP. Never trust a request Host
// header to choose the destination of an emailed sign-in link.
export function signInBaseUrl(env=process.env) {
  let url;
  try { url=new URL(env.APP_URL); } catch { throw new Error('Set APP_URL to your Ahoy address, for example http://localhost:3000 locally or your public HTTPS address.'); }
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/') throw new Error('APP_URL must be just your Ahoy origin, without a path, query or credentials.');
  const localHttp=!env.VERCEL && url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!localHttp) throw new Error('Use HTTPS for your public APP_URL. Plain HTTP is only allowed on localhost, 127.0.0.1 or [::1] for local testing.');
  return url.origin;
}
export async function sendSignInEmail({email,token,baseUrl},env=process.env,fetchImpl=fetch) {
  const response=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.EMAIL_FROM,to:email,subject:'Your little doorway to Ahoy',text:`Welcome back. Sign in to your Ahoy workspace: ${baseUrl}/api/auth/verify?token=${token}\nThis link expires in 15 minutes. If you didn’t ask for it, ignore this email.`}),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) {
    const details=await response.json().catch(()=>({}));
    // Show actionable configuration guidance, never provider payloads or secrets.
    if(details.name==='suspended_api_key') throw new Error('Resend has suspended this API key. Check the key status in your Resend account.');
    if(details.name==='restricted_api_key'&&response.status===403) throw new Error('This Resend API key is not active. Check its status or use an active sending key, then restart Ahoy.');
    if(details.name==='invalid_permission') throw new Error('The Resend key does not permit this sending action. Check its sending permissions and allowed domain.');
    if(response.status===401||details.name==='validation_error'&&/api key/i.test(details.message||'')) throw new Error('Resend rejected the email API key. Check RESEND_API_KEY and restart Ahoy.');
    if(response.status===403) throw new Error('Resend refused this sender or recipient. Verify the EMAIL_FROM domain in Resend. If using onboarding@resend.dev, send only to the email registered with your Resend account.');
    if(response.status===429) throw new Error('Resend is limiting email requests. Wait a moment, then try again.');
    throw new Error('Resend could not send the sign-in email. Check EMAIL_FROM and your Resend email logs, then try again.');
  }
}
