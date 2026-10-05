/**
 * Cloudflare Pages Function: POST /api/ai
 * ─────────────────────────────────────────────────────────────────────────────
 * Strategy (in priority order):
 *   1. If LOCAL_API_URL is set → proxy the whole request to the local Node server.
 *      The Node server has direct internet access and no CF routing restrictions.
 *   2. Otherwise → call the AI provider directly from the CF Edge Worker.
 *      Note: some IBM endpoints (inference.bob.ibm.com) may be unreachable from
 *      CF edge (error 530/1016). In that case the user sees a clear message.
 *
 * Body: { message, history, fileContext, provider, model, apiKey, baseUrl }
 * ─────────────────────────────────────────────────────────────────────────────
 */
// Safe JSON parse — returns [data, null] or [null, rawText]
async function safeJson(res) {
  const text = await res.text();
  try { return [JSON.parse(text), null]; }
  catch { return [null, text]; }
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS });
  }

  // ── Strategy 1: proxy to local Node server if LOCAL_API_URL is set ───────
  // This avoids CF edge routing restrictions for endpoints like inference.bob.ibm.com
  const localApi = env?.LOCAL_API_URL;
  if (localApi) {
    try {
      const r = await fetch(`${localApi}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const [data, rawText] = await safeJson(r);
      if (!r.ok || !data) {
        return new Response(JSON.stringify({ error: `Local server lỗi (${r.status}): ${rawText?.slice(0,200) || ''}` }), { status: r.status || 502, headers: CORS });
      }
      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    } catch (e) {
      // Local server unreachable — fall through to direct edge call
    }
  }

  const {
    message    = '',
    history    = [],
    fileContext = '',
    provider   = 'openai',
    model,
    apiKey     = '',
    baseUrl    = '',
  } = body;

  if (!apiKey) return new Response(JSON.stringify({ error: 'Thiếu API key.' }), { status: 400, headers: CORS });
  if (!message) return new Response(JSON.stringify({ error: 'Thiếu message.' }), { status: 400, headers: CORS });

  // ── Provider config ────────────────────────────────────────────────────────
  const bobTeamId = (provider === 'bob') ? (baseUrl || '') : '';
  const PROVIDERS = {
    openai:  { url: 'https://api.openai.com/v1/chat/completions',                  defaultModel: 'gpt-4o-mini',                  auth: `Bearer ${apiKey}`, extra: {} },
    groq:    { url: 'https://api.groq.com/openai/v1/chat/completions',             defaultModel: 'llama-3.1-8b-instant',          auth: `Bearer ${apiKey}`, extra: {} },
    mistral: { url: 'https://api.mistral.ai/v1/chat/completions',                  defaultModel: 'mistral-small-latest',          auth: `Bearer ${apiKey}`, extra: {} },
    gemini:  { url: `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, defaultModel: 'gemini-1.5-flash', auth: null, extra: {} },
    bob:     { url: 'https://inference.bob.ibm.com/v1/chat/completions',           defaultModel: 'ibm/granite-3-3-8b-instruct',   auth: `Bearer ${apiKey}`, extra: bobTeamId ? { 'X-Team-ID': bobTeamId } : {} },
    custom:  { url: baseUrl || '',                                                  defaultModel: model || 'gpt-4o-mini',           auth: `Bearer ${apiKey}`, extra: {} },
  };

  const cfg          = PROVIDERS[provider] || PROVIDERS.openai;
  const chosenModel  = model || cfg.defaultModel;
  const endpointUrl  = cfg.url;

  if (!endpointUrl) {
    return new Response(JSON.stringify({ error: 'Custom provider: baseUrl là bắt buộc.' }), { status: 400, headers: CORS });
  }

  // ── IBM Bob note ───────────────────────────────────────────────────────────
  // inference.bob.ibm.com may be unreachable from CF edge (530/1016).
  // If this call fails, instruct user to set LOCAL_API_URL (Cloudflare Tunnel).

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `Bạn là trợ lý AI tích hợp trong ứng dụng quản lý file nội bộ "Trợ Lý Tìm File".
Nhiệm vụ: giúp người dùng tìm kiếm, quản lý tài liệu (PDF, Word, Excel, ảnh scan, video).
Trả lời bằng tiếng Việt, ngắn gọn, thực dụng.
Khi người dùng muốn tìm file, trả về JSON action:
{"action":"search","query":"<từ khóa>","ext":"<đuôi file hoặc rỗng>"}
Context file hiện tại: ${fileContext || 'không có'}`;

  // ── Build request & call AI ────────────────────────────────────────────────
  try {
    let aiResponse;

    if (provider === 'gemini') {
      // Gemini REST format
      const geminiBody = {
        contents: [
          ...history.slice(-10)
            .filter(h => h.role !== 'system')
            .map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
          { role: 'user', parts: [{ text: message }] },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      };

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });

      const [data, rawText] = await safeJson(res);
      if (!res.ok || !data) {
        const errMsg = data?.error?.message || rawText || `HTTP ${res.status}`;
        return new Response(JSON.stringify({ error: `Gemini: ${errMsg}` }), { status: res.status || 502, headers: CORS });
      }
      aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      // OpenAI-compatible format (OpenAI, Groq, Mistral, IBM Bob, Custom)
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.auth ? { 'Authorization': cfg.auth } : {}),
          ...cfg.extra,
        },
        body: JSON.stringify({ model: chosenModel, messages, temperature: 0.7, max_tokens: 1024 }),
      });

      const [data, rawText] = await safeJson(res);
      if (!res.ok || !data) {
        const errMsg = rawText?.slice(0, 300) || `HTTP ${res.status}`;
        // Special guidance for IBM Bob 530/1016 from CF edge
        const hint = (provider === 'bob' && (res.status === 530 || res.status === 0 || errMsg.includes('1016')))
          ? ' — IBM Bob không thể gọi trực tiếp từ Cloudflare Edge. Cần cài LOCAL_API_URL (Cloudflare Tunnel) để proxy qua máy chủ local.'
          : '';
        return new Response(JSON.stringify({ error: `${provider} lỗi (${res.status}): ${errMsg}${hint}` }), { status: res.status || 502, headers: CORS });
      }
      if (data.error) {
        const errMsg = data.error?.message || JSON.stringify(data.error);
        return new Response(JSON.stringify({ error: errMsg }), { status: res.status || 400, headers: CORS });
      }
      aiResponse = data?.choices?.[0]?.message?.content || '';
    }

    return new Response(
      JSON.stringify({ reply: aiResponse, model: chosenModel }),
      { status: 200, headers: CORS }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Edge Worker lỗi: ${e.message}` }),
      { status: 500, headers: CORS }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
