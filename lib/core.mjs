import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function signatureValid(raw, signature, secret) {
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function matches(comment, keywords, mode = 'contains', ignoreCase = true) {
  const normalize = s => ignoreCase ? s.toLocaleLowerCase() : s;
  const text = normalize(comment.trim());
  return keywords.some(k => k.trim() && (mode === 'exact' ? text === normalize(k.trim()) : text.includes(normalize(k.trim()))));
}
export const optedOut = text => /^(stop|unsubscribe|opt out)$/i.test(text.trim());
export function personalize(text, username) { return text.replaceAll('{username}', username); }
export function validateCampaign(body) {
  if (!body.name?.trim() || body.name.length > 100) throw new Error('Give your campaign a name (up to 100 characters).');
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(k => String(k).trim()).filter(Boolean) : [];
  if (!keywords.length || keywords.length > 20 || keywords.some(k=>k.length>80)) throw new Error('Add 1–20 keywords, each under 80 characters.');
  if (!body.dmTemplate?.trim() || body.dmTemplate.length > 1000) throw new Error('Write a message between 1 and 1,000 characters.');
  if (!['exact','contains'].includes(body.matchMode)) throw new Error('Choose exact or contains matching.');
  if (!['any','specific'].includes(body.triggerType)) throw new Error('Choose which posts to use.');
  if (body.triggerType === 'specific' && !body.mediaId) throw new Error('Choose a post first.');
  if (body.requireFollow) throw new Error('Follow confirmation is not available yet.');
  if (body.linkUrl) { const url = new URL(body.linkUrl); if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a complete https:// link.'); }
  return {name:body.name.trim(),keywords,dmTemplate:body.dmTemplate.trim(),publicReply:String(body.publicReply||'').slice(0,1000),matchMode:body.matchMode,ignoreCase:body.ignoreCase!==false,triggerType:body.triggerType,mediaId:String(body.mediaId||''),linkUrl:body.linkUrl||'',active:body.active!==false};
}
function encryptionKey() { const key=Buffer.from(process.env.ENCRYPTION_KEY||'','hex'); if(key.length!==32) throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters.'); return key; }
export function encrypt(text) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv); const ciphertext=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]); return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64url')).join('.'); }
export function decrypt(text) { const [iv,tag,data]=text.split('.').map(b=>Buffer.from(b,'base64url')); const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv); cipher.setAuthTag(tag); return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'); }
export function isBot(headers) { return /bot|crawler|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|headless/i.test(headers.get('user-agent')||'') || /prefetch|prerender/i.test((headers.get('purpose')||'')+' '+(headers.get('sec-purpose')||'')); }
