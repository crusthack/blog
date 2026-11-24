const app = "https://app.crusthack.com";
const site = "https://crusthack.com";
const dynamic = /^\/(?:api|login|join|setup|write|admin|settings|storage|workspaces|bookmarks|health|community)(?:\/|$)|^\/(?:posts\/(?:manage|trash)|categories\/manage)(?:\/|$)|^\/posts\/[^/]+\/\d+\/slides(?:\/|$)/;

export async function route(request, send = fetch) {
  const url = new URL(request.url);
  if (url.origin !== site) return new Response("Unknown host", {status: 404});

  const upstream = async (signal) => {
    const target = new URL(app);
    target.pathname = url.pathname;
    target.search = url.search;
    const forwarded = new Request(target, request);
    forwarded.headers.delete("host");
    const response = await send(new Request(forwarded, {redirect: "manual", signal: signal ?? request.signal}), {cache: "no-store"});
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "private, no-store");
    const location = result.headers.get("location");
    if (location) {
      const redirect = new URL(location, target);
      if (redirect.origin === app) result.headers.set("location", site + redirect.pathname + redirect.search + redirect.hash);
    }
    return result;
  };

  const cookies = request.headers.get("Cookie") || "";
  const signedIn = /(?:^|;\s*)blog\.session(?:C\d+)?=/.test(cookies);
  const grant = /(?:^|;\s*)blog\.post\.\d+=/.test(cookies);
  const chunk = url.pathname.startsWith("/_next/static/");
  const publishedFile = url.pathname.startsWith("/static/assets/") || ["/icon.png", "/static-manifest.json", "/sitemap.xml", "/robots.txt"].includes(url.pathname);
  if (!["GET", "HEAD"].includes(request.method) || dynamic.test(url.pathname)) return upstream();

  // Preserve the personalized view while AWS is healthy. On an outage, only
  // the anonymous snapshot may be used in its place.
  const personalized = (signedIn || grant) && !chunk && !publishedFile;
  if (personalized) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const live = await upstream(controller.signal);
      if (live.status < 500) return live;
    } catch (error) {
      if (request.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Fetch through the zone's Pages origin without forwarding browser credentials.
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  const response = await send(new Request(url, {method: request.method, headers, redirect: "manual"}));
  if (!personalized && response.status === 404 && (chunk || /^\/posts\/(?:[^/]+\/)?\d+\/?$/.test(url.pathname))) return upstream();
  return response;
}

export default {fetch: request => route(request)};
