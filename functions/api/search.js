/**
 * Cloudflare Pages Function: /api/search
 * Proxies to local server if LOCAL_API_URL is set, else returns demo response.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const localApi = env.LOCAL_API_URL;

  if (localApi) {
    try {
      const proxied = `${localApi}/api/search${url.search}`;
      const r = await fetch(proxied);
      const d = await r.json();
      return new Response(JSON.stringify(d), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    results: [],
    total: 0,
    indexSize: 0,
    demo: true,
    message: 'Server local chưa kết nối. Chạy start.bat trên máy tính để bật tìm kiếm.'
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
