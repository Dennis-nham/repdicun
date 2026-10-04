/**
 * Cloudflare Pages Function: catch-all API proxy
 * /api/[...] → forwards to LOCAL_API_URL if configured
 */
export async function onRequest(context) {
  const { request, env, params } = context;
  const localApi = env.LOCAL_API_URL;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (localApi) {
    try {
      const proxied = `${localApi}${url.pathname}${url.search}`;
      const init = {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (request.method === 'POST') {
        init.body = await request.text();
      }
      const r = await fetch(proxied, init);
      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: {
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Không thể kết nối server local: ' + e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  return new Response(JSON.stringify({
    demo: true,
    error: 'SERVER_NOT_CONNECTED',
    message: 'Tính năng này cần server local. Chạy start.bat và trỏ LOCAL_API_URL về máy bạn qua Cloudflare Tunnel.'
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
