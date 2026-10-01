export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.CANONICAL_ORIGIN && url.origin !== env.CANONICAL_ORIGIN)
      return Response.redirect(env.CANONICAL_ORIGIN + url.pathname + url.search, 308);
    if (env.ENTRY === "utn" && url.pathname === "/")
      return Response.redirect(url.origin + "/utn/" + url.search, 302);
    if (env.ENTRY === "api") {
      if (url.pathname.startsWith("/v1/"))
        url.pathname = "/utn-api" + url.pathname;
      else if (url.pathname.startsWith("/api/invitations/"))
        url.pathname = "/api/utn" + url.pathname;
      else
        return new Response(
          JSON.stringify({
            service: "UTN Sandbox API",
            version: "v1",
            endpoint: "/v1/verification-requests",
          }),
          {
            status: url.pathname === "/" ? 200 : 404,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
    }
    return env.CORE.fetch(new Request(url, request));
  },
};
