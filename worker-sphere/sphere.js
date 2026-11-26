// garden-sphere: Brodie's thinking and his voice, for the Garden of Delight (src/sphere.js). Players who bring their own Anthropic key
// don't come here; everyone else does.
//   POST /chat  { messages, context } -> { text }   Claude Haiku, as Brodie (src/brodie.js: the same prompt the browser uses)
//   POST /speak { text } -> audio/mpeg              Brodie's voice: an ElevenLabs voice (optional: off until its key and voice are set)
//   GET  /health -> { chat, voice }
// Secrets (set them yourself in the dashboard or with wrangler secret put; nothing here holds them):
//   ANTHROPIC_API_KEY   for /chat
//   ELEVENLABS_API_KEY  for /speak (optional)
// Vars (wrangler.toml): ORIGINS (who may call it), MODEL, BRODIE_VOICE (an ElevenLabs voice id), and a per-address rate limit (LIMIT).
import { systemPrompt, cleanMessages, MODEL } from '../src/brodie.js';

const json = (o, h, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...h, 'content-type': 'application/json' } });
function allowed(origin, list) {
  if (!origin) return false;
  return String(list || '').split(',').map(s => s.trim()).filter(Boolean).some(p => p === origin || (p.startsWith('*.') && new URL(origin).hostname.endsWith(p.slice(1))) || (p.startsWith('http://localhost') && origin.startsWith('http://localhost')));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '', ok = allowed(origin, env.ORIGINS);
    const cors = { 'Access-Control-Allow-Origin': ok ? origin : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/health') return json({ chat: !!env.ANTHROPIC_API_KEY, voice: !!(env.ELEVENLABS_API_KEY && env.BRODIE_VOICE) }, cors);
    if (req.method !== 'POST' || !['/chat', '/speak'].includes(url.pathname)) return json({ error: 'not found' }, cors, 404);
    if (!ok) return json({ error: 'not from the garden' }, cors, 403);
    if (env.LIMIT) { const { success } = await env.LIMIT.limit({ key: (req.headers.get('CF-Connecting-IP') || 'x') + url.pathname }); if (!success) return json({ error: 'slow down' }, cors, 429); }
    const raw = await req.text(); if (raw.length > 16000) return json({ error: 'too long' }, cors, 413);
    let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: 'bad json' }, cors, 400); }

    if (url.pathname === '/chat') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'no key' }, cors, 503);
      const messages = cleanMessages(body.messages); if (!messages.length) return json({ error: 'nothing said' }, cors, 400);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: env.MODEL || MODEL, max_tokens: 300, system: systemPrompt(String(body.context || '').slice(0, 600)), messages }) });
      if (!r.ok) return json({ error: 'claude ' + r.status }, cors, 502);
      const j = await r.json(); return json({ text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim() }, cors);
    }
    // /speak
    if (!env.ELEVENLABS_API_KEY || !env.BRODIE_VOICE) return json({ error: 'no voice' }, cors, 503);
    const text = String(body.text || '').slice(0, 400).trim(); if (!text) return json({ error: 'nothing to say' }, cors, 400);
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.BRODIE_VOICE)}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ text, model_id: env.VOICE_MODEL || 'eleven_flash_v2_5' }) });
    if (!r.ok) return json({ error: 'voice ' + r.status }, cors, 502);
    return new Response(r.body, { headers: { ...cors, 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  },
};
