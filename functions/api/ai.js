/**
 * Cloudflare Pages Function: POST /api/ai
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs entirely on Cloudflare Edge — does NOT need LOCAL_API_URL.
 * Supports: OpenAI · Groq · Google Gemini · Mistral · Custom OpenAI-compatible
 *
 * Body: { message, history, fileContext, provider, model, apiKey, baseUrl }
 * The API key travels only over HTTPS from the user's browser to this Worker,
 * then from this Worker to the AI provider — it is never stored or logged.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function onRequestPost(context) {
  const { request } = context;

  // ── CORS preflight (handled by [[path]].js, but guard here too) ──────────
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders });
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

  if (!apiKey) return new Response(JSON.stringify({ error: 'Thiếu API key.' }), { status: 400, headers: corsHeaders });
  if (!message) return new Response(JSON.stringify({ error: 'Thiếu message.' }), { status: 400, headers: corsHeaders });

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
    return new Response(JSON.stringify({ error: 'Custom provider: baseUrl là bắt buộc.' }), { status: 400, headers: corsHeaders });
  }

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

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message || JSON.stringify(data);
        return new Response(JSON.stringify({ error: errMsg }), { status: res.status, headers: corsHeaders });
      }
      aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      // OpenAI-compatible format (OpenAI, Groq, Mistral, Custom)
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': cfg.auth,
          ...cfg.extra,
        },
        body: JSON.stringify({ model: chosenModel, messages, temperature: 0.7, max_tokens: 1024 }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data?.error?.message || JSON.stringify(data.error || data);
        return new Response(JSON.stringify({ error: errMsg }), { status: res.status || 400, headers: corsHeaders });
      }
      aiResponse = data?.choices?.[0]?.message?.content || '';
    }

    return new Response(
      JSON.stringify({ reply: aiResponse, model: chosenModel }),
      { status: 200, headers: corsHeaders }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Edge Worker lỗi: ${e.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
