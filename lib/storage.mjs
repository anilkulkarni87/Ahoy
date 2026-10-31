export function storageConfig(env=process.env) {
  if (env.DATABASE_URL) {
    if(env.VERCEL && !env.DATABASE_URL.startsWith('libsql://')) throw new Error('Use a Turso libsql:// DATABASE_URL on Vercel, or remove DATABASE_URL to try the temporary demo.');
    return {url:env.DATABASE_URL,authToken:env.DATABASE_AUTH_TOKEN,temporary:false};
  }
  if(env.VERCEL) {
    if(env.DEMO_MODE==='false'||env.LIVE_SENDS_ENABLED==='true') throw new Error('Connect Turso before enabling real accounts or live messages on Vercel.');
    return {url:'file:/tmp/ahoy-demo.db',temporary:true};
  }
  return {url:'file:data/ahoy.db',temporary:false,directory:'data'};
}
