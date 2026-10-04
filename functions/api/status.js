/**
 * Cloudflare Pages Function: /api/status
 * Returns a static status when running on Cloudflare (no local server).
 * When LOCAL_API_URL env var is set, proxies to your local server via Cloudflare Tunnel.
 */
export async function onRequest(context) {
  const { env } = context;
  const localApi = env.LOCAL_API_URL;

  // If LOCAL_API_URL is configured, proxy to local server
  if (localApi) {
    try {
      const r = await fetch(`${localApi}/api/status`, { cf: { cacheTtl: 0 } });
      const d = await r.json();
      return new Response(JSON.stringify(d), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      // Fall through to demo mode
    }
  }

  // Demo mode (no local server)
  return new Response(JSON.stringify({
    ready: true,
    indexing: false,
    fileCount: 0,
    lastIndexed: null,
    demo: true,
    message: 'Chạy ở chế độ demo. Kết nối server local để tìm file thực.'
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
