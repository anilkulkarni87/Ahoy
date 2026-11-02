import { db,init } from './db.mjs';
import { launchBoundary } from './launch.mjs';

export const failureLabels={'paused':'Campaign paused','disconnected':'Account disconnected','opt-out':'Person opted out','live-off':'Live sends disabled','rate-limit':'Waiting for Meta rate limit','meta-rejected':'Meta rejected a message','unknown-outcome':'Message acceptance could not be confirmed','verification-unavailable':'Meta could not verify the follow','closed':'Closed before launch'};
export async function conversionReport(tenant,{period='7',campaignId='',now=Date.now()}={}) {
 if(!['7','30','90','launch'].includes(period))throw new Error('Choose 7, 30, 90 days or since launch.');
 await init();
 const launch=await launchBoundary(tenant),retainedFrom=new Date(now-90*86400000).toISOString();
 const requested=period==='launch'?retainedFrom:new Date(now-Number(period)*86400000).toISOString();
 const since=new Date(Math.max(Date.parse(requested),launch?Date.parse(launch):0)).toISOString(),until=new Date(now).toISOString();
 const [result,problems,coverage,legacy]=await Promise.all([
  db().execute({sql:`SELECT m.campaign_id,m.gated,c.data,
    count(*) AS replies,count(DISTINCT m.person_key) AS matched,
    count(DISTINCT CASE WHEN m.request_at IS NOT NULL THEN m.person_key END) AS requested,
    count(DISTINCT CASE WHEN m.request_at IS NOT NULL AND m.check_at IS NOT NULL THEN m.person_key END) AS checked,
    count(DISTINCT CASE WHEN m.request_at IS NOT NULL AND m.check_at IS NOT NULL AND m.verified_at IS NOT NULL THEN m.person_key END) AS verified,
    count(DISTINCT CASE WHEN m.resource_at IS NOT NULL AND (m.gated=0 OR (m.request_at IS NOT NULL AND m.check_at IS NOT NULL AND m.verified_at IS NOT NULL)) THEN m.person_key END) AS accepted,
    avg(CASE WHEN m.resource_at IS NOT NULL THEN max(0,(julianday(m.resource_at)-julianday(m.created_at))*86400) END) AS average_delay_seconds,
    sum(CASE WHEN m.resource_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted_replies
    FROM delivery_metrics m LEFT JOIN campaigns c ON c.tenant=m.tenant AND c.id=m.campaign_id
    WHERE m.tenant=? AND m.created_at>=? AND m.created_at<=? AND (?='' OR m.campaign_id=?)
    GROUP BY m.campaign_id,m.gated ORDER BY matched DESC,m.campaign_id,m.gated`,args:[tenant,since,until,campaignId,campaignId]}),
  db().execute({sql:`SELECT failure_code,count(*) AS count FROM delivery_metrics WHERE tenant=? AND created_at>=? AND created_at<=? AND (?='' OR campaign_id=?) AND failure_code IS NOT NULL GROUP BY failure_code`,args:[tenant,since,until,campaignId,campaignId]}),
  db().execute('SELECT started_at FROM observation_start WHERE id=1'),
  db().execute({sql:`SELECT count(*) AS count FROM activity a WHERE a.tenant=? AND julianday(a.created_at)>=julianday(?) AND julianday(a.created_at)<=julianday(?) AND a.campaign_id IS NOT NULL AND (?='' OR a.campaign_id=?) AND NOT EXISTS(SELECT 1 FROM delivery_metrics m WHERE m.activity_id=a.id AND m.tenant=a.tenant)`,args:[tenant,since,until,campaignId,campaignId]})
 ]);
 return {period,since,until,launchBoundary:launch,retainedFrom,coverageSince:coverage.rows[0]?.started_at,untrackedActivity:Number(legacy.rows[0].count),campaigns:result.rows.map(r=>({campaignId:r.campaign_id,name:r.data?JSON.parse(r.data).name:'Removed campaign',mode:r.gated?'after-follow':'immediate',replies:Number(r.replies),matched:Number(r.matched),requested:Number(r.requested),checked:Number(r.checked),verified:Number(r.verified),accepted:Number(r.accepted),acceptedReplies:Number(r.accepted_replies),averageDelaySeconds:r.average_delay_seconds===null?null:Math.round(Number(r.average_delay_seconds)),acceptanceRate:r.matched?Math.round(Number(r.accepted)/Number(r.matched)*100):0})),problems:problems.rows.map(r=>({code:r.failure_code,label:failureLabels[r.failure_code],count:Number(r.count)}))};
}
export async function connectionHealth(tenant,{demo=false,now=Date.now()}={}) {
 await init();
 const [accounts,signals,queues,recent,outbox]=await Promise.all([
  db().execute({sql:'SELECT id,username,expires_at FROM accounts WHERE tenant=?',args:[tenant]}),
  db().execute({sql:'SELECT account_id,kind,status,checked_at FROM connection_signals WHERE tenant=?',args:[tenant]}),
  db().execute({sql:`SELECT a.account_id,
   sum(CASE WHEN status IN ('queued','rate-limited') THEN 1 ELSE 0 END) AS queued,
   min(CASE WHEN status IN ('queued','rate-limited') THEN strftime('%Y-%m-%dT%H:%M:%fZ',a.created_at) END) AS oldest,
   sum(CASE WHEN status IN ('awaiting-follow','verification-unavailable','checking-follow') THEN 1 ELSE 0 END) AS follow_pending,
   sum(CASE WHEN status='failed' AND julianday(COALESCE(m.outcome_at,a.created_at))>=julianday(?) THEN 1 ELSE 0 END) AS failed
   FROM activity a LEFT JOIN delivery_metrics m ON m.tenant=a.tenant AND m.activity_id=a.id WHERE a.tenant=? GROUP BY a.account_id`,args:[new Date(now-86400000).toISOString(),tenant]}),
  db().execute({sql:'SELECT id,account_id,username,status,created_at FROM activity WHERE tenant=? ORDER BY julianday(created_at) DESC LIMIT 20',args:[tenant]}),
  demo?Promise.resolve({rows:[{count:0}]}):db().execute('SELECT count(*) AS count FROM webhook_events WHERE dispatched=0')
 ]);
 const generatedAt=new Date(now).toISOString();
 const accountRows=demo&&accounts.rows.length===0?[{id:'demo-account',username:'the.slow.studio'}]:accounts.rows;
 const list=accountRows.map(a=>{
  const evidence=Object.fromEntries(signals.rows.filter(s=>s.account_id===a.id).map(s=>[s.kind,{status:s.status,at:s.checked_at}]));
  const q=queues.rows.find(r=>r.account_id===a.id)||{};
  const expired=!!a.expires_at&&Date.parse(a.expires_at.includes('T')?a.expires_at:a.expires_at.replace(' ','T')+'Z')<now;
  const waiting=Number(q.queued)||0,failed=Number(q.failed)||0;
  const oldest=q.oldest?Date.parse(q.oldest.includes('T')?q.oldest:q.oldest.replace(' ','T')+'Z'):null;
  const delayed=waiting>0&&Number.isFinite(oldest)&&now-oldest>10*60000;
  let nextAction={view:'setup',message:'No recent activity is not a fault. Run a guided test to verify the full path.'};
  if(expired||evidence.access?.status==='failed')nextAction={view:'accounts',message:'Check this account’s connection. Reconnect if access is no longer valid.'};
  else if(delayed)nextAction={view:'guide',message:'Replies have waited over 10 minutes. Check Inngest sync, recent runs and account throttling in the setup guide.'};
  else if(failed)nextAction={view:'activity',message:'Some recent replies need attention. Open Activity and review the reason before retrying.'};
  else if(waiting)nextAction={view:'activity',message:'Replies are queued. Refresh shortly; account throttling can delay processing.'};
  else if(evidence.accepted)nextAction={view:'activity',message:'Meta has accepted a message. Check the recipient’s Instagram inbox to confirm the experience.'};
  return {id:a.id,username:a.username,expired,signals:evidence,queued:waiting,awaitingFollow:Number(q.follow_pending)||0,failed,delayed,nextAction};
 });
 const safeSummary={generatedAt,demo,liveSendsEnabled:!demo&&process.env.LIVE_SENDS_ENABLED==='true',undispatchedWebhooks:Number(outbox.rows[0].count),accounts:list.map(a=>({account:'Connected account '+(list.indexOf(a)+1),expired:a.expired,queued:a.queued,awaitingFollow:a.awaitingFollow,failed:a.failed,delayed:a.delayed,signals:a.signals}))};
 return {generatedAt,demo,liveSendsEnabled:safeSummary.liveSendsEnabled,undispatchedWebhooks:safeSummary.undispatchedWebhooks,accounts:list,recent:recent.rows,safeSummary};
}
