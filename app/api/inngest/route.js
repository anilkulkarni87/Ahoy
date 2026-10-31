import { serve } from 'inngest/next';
import { inngest, delivery, reconcile, maintenance, ingest } from '../../../lib/jobs.mjs';
export const runtime='nodejs';
export const { GET,POST,PUT }=serve({client:inngest,functions:[delivery,reconcile,maintenance,ingest]});
