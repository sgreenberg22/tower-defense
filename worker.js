// Worker entry for `wrangler deploy` (Workers + static assets).
// Static files are served straight from the assets binding; only /api/* runs this code.
// The API itself lives in functions/api/[[path]].js so it also still works as a Pages Function.
import { onRequest } from './functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      return onRequest({ request, env, params: { path }, waitUntil: (p) => ctx.waitUntil(p) });
    }
    return env.ASSETS.fetch(request);
  },
};
