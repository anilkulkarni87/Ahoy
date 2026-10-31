export function diagnostics(accountCount=0) {
 const env=process.env;
 return [
  {id:'database',name:'Your data has a home',detail:env.DATABASE_URL?.startsWith('libsql:')?'Turso is configured.':env.VERCEL?'Temporary demo storage is active. It may reset between requests or deployments. Add Turso to keep your data.':'Local SQLite is ready. For serverless hosting, connect Turso.',ok:!env.VERCEL||!!env.DATABASE_URL?.startsWith('libsql:')},
  {id:'address',name:'A secure home for Ahoy',detail:'Set APP_URL to your public https:// address so Instagram can reach you.',ok:env.APP_URL?.startsWith('https://')||false},
  {id:'email',name:'Sign in from your inbox',detail:'Add OWNER_EMAIL, RESEND_API_KEY and EMAIL_FROM to enable private email sign-in.',ok:!!(env.OWNER_EMAIL&&env.RESEND_API_KEY&&env.EMAIL_FROM)},
  {id:'encryption',name:'Keep account keys private',detail:'Add a 64-character hexadecimal ENCRYPTION_KEY. Never share it.',ok:/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY||'')},
  {id:'meta',name:'Your Instagram connection',detail:'Add META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN and a supported META_API_VERSION.',ok:!!(env.META_APP_ID&&env.META_APP_SECRET&&env.META_VERIFY_TOKEN&&/^v\d+\.\d+$/.test(env.META_API_VERSION||''))},
  {id:'jobs',name:'Deliver even when you’re away',detail:'Connect Inngest and sync /api/inngest. These keys alone do not confirm the sync.',ok:!!(env.INNGEST_EVENT_KEY&&env.INNGEST_SIGNING_KEY)},
  {id:'account',name:'An account to send from',detail:accountCount?'Instagram is connected. Use “Check connection” to validate its token.':'Connect a professional Instagram account after the checks above.',ok:accountCount>0},
  {id:'live',name:'Ready for real messages',detail:'After a real end-to-end test and policy review, set LIVE_SENDS_ENABLED=true.',ok:env.LIVE_SENDS_ENABLED==='true'}
 ];
}
