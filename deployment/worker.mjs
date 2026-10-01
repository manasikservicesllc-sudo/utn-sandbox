import { DurableObject } from "cloudflare:workers";
import { createRuntime } from "../server/services.mjs";
import { sign, equal } from "../server/shared.mjs";

async function dispatch(handler, request) {
  const headers = new Headers();
  let status = 200,
    output;
  const req = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    async *[Symbol.asyncIterator]() {
      if (request.body)
        for await (const chunk of request.body) yield Buffer.from(chunk);
    },
  };
  const res = {
    setHeader(k, v) {
      headers.set(k, v);
    },
    writeHead(s, h = {}) {
      status = s;
      for (const [k, v] of Object.entries(h)) headers.set(k, v);
    },
    end(v) {
      output = v;
    },
  };
  await handler(req, res);
  return new Response(output, { status, headers });
}

export class PrototypeState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.stores = new Map();
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    const store = (name, initial) => {
      const rows = ctx.storage.sql
        .exec("SELECT value FROM state WHERE name = ?", name)
        .toArray();
      const result = {
        data: rows.length ? JSON.parse(rows[0].value) : initial,
        save() {
          ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO state(name,value) VALUES (?,?)",
            name,
            JSON.stringify(result.data),
          );
        },
      };
      this.stores.set(name, result);
      return result;
    };
    this.runtime = createRuntime({
      dataDir: "/",
      store,
      secret: env.SERVICE_SECRET,
      partnerApiKey: env.SANDBOX_PARTNER_API_KEY,
      partnerCallbackUrl: env.PARTNER_CALLBACK_URL,
      partnerCallbackSecret: env.PARTNER_CALLBACK_SECRET,
      apiKey: env.OPENAI_API_KEY || "",
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      origins: [env.PUBLIC_ORIGIN, env.UTN_ORIGIN, env.API_ORIGIN].filter(
        Boolean,
      ),
      utnWebUrl: (env.UTN_ORIGIN || env.PUBLIC_ORIGIN) + "/utn/?token=",
      post: async (url, value, headers) => {
        const hostname = new URL(url).hostname,
          role = hostname.split(".")[0];
        const request = new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(value),
          signal: AbortSignal.timeout(15000),
        });
        const response = await (["ota.internal", "utn.internal"].includes(
          hostname,
        )
          ? env.STATE.getByName(role).fetch(request)
          : fetch(request));
        const raw = await response.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        if (!response.ok)
          throw Object.assign(
            new Error(data.error || "Callback endpoint rejected request"),
            { status: response.status },
          );
        return data;
      },
    });
    this.runtime.setUrls({
      otaUrl: "https://ota.internal",
      utnUrl: "https://utn.internal",
    });
  }
  async fetch(request) {
    const role = new URL(request.url).hostname.split(".")[0];
    const response = await dispatch(
      role === "utn" ? this.runtime.utnHandler : this.runtime.otaHandler,
      request,
    );
    await this.scheduleRetry();
    return response;
  }
  async scheduleRetry() {
    if (
      [...this.stores.values()].some((s) =>
        s.data.outbox?.some((e) => !e.delivered && !e.disabled),
      )
    )
      await this.ctx.storage.setAlarm(Date.now() + 30000);
  }
  async alarm() {
    await this.runtime.retryCallbacks();
    await this.scheduleRetry();
  }
}

const login = `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manasik · Private presentation</title><style>body{margin:0;background:#102b29;color:#efe9da;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{max-width:360px;padding:40px}h1{font:46px Georgia}input,button{box-sizing:border-box;width:100%;padding:16px;border-radius:9px;margin:10px 0;border:1px solid #657976}button{background:#d9b574;color:#102b29;font-weight:bold;cursor:pointer}p{line-height:1.7;color:#c3ceca}</style><main><small>MANASIK × UTN</small><h1>A journey built<br>on trust.</h1><p>Private prototype presentation. Enter your presentation access code to continue.</p><form method="post" action="/presenter"><input type="password" name="password" required placeholder="Presentation access code" autocomplete="current-password"><button>Enter experience →</button></form></main></html>`;
export default {
  async fetch(request, env) {
    if (!env.DEMO_PASSWORD || !env.SERVICE_SECRET)
      return new Response("Presentation is not configured", { status: 503 });
    const url = new URL(request.url);
    // Partner requests authenticate inside the UTN service; scoped invitations use
    // high-entropy expiring capability tokens and can be opened by the native app.
    const partner = url.pathname.match(
      /^\/utn-api\/v1\/verification-requests(?:\/[^/]+)?$/,
    );
    const invitation = url.pathname.match(
      /^\/api\/utn(\/api\/invitations\/[^/]+(?:\/(?:verify|certificate))?)$/,
    );
    if (partner || invitation) {
      if (partner && !env.SANDBOX_PARTNER_API_KEY)
        return new Response(
          JSON.stringify({ error: "Partner sandbox is not configured" }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      const path = partner
        ? url.pathname.replace("/utn-api", "/api")
        : invitation[1];
      return env.STATE.getByName("utn").fetch(
        new Request(`https://utn.internal${path}${url.search}`, request),
      );
    }
    // The UTN shell contains no applicant information; the invitation API enforces
    // its scoped token. This lets invited pilgrims enter without presenter access.
    if (url.pathname === "/utn" || url.pathname.startsWith("/utn/"))
      return env.ASSETS.fetch(request);
    if (url.pathname === "/presenter" && request.method === "POST") {
      const form = await request.formData();
      if (!equal(String(form.get("password") || ""), env.DEMO_PASSWORD))
        return new Response(login, {
          status: 401,
          headers: {
            "content-type": "text/html;charset=utf-8",
            "cache-control": "no-store",
          },
        });
      const expires = String(Date.now() + 86400000),
        cookie = expires + "." + sign(expires, env.DEMO_PASSWORD);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `utn_presenter=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      });
    }
    const cookie =
      request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)utn_presenter=([^;]+)/)?.[1] || "";
    const [expiry, signature] = cookie.split(".");
    if (
      !(
        Number(expiry) > Date.now() &&
        equal(signature, sign(expiry || "", env.DEMO_PASSWORD))
      )
    )
      return new Response(
        url.pathname.startsWith("/api/")
          ? JSON.stringify({ error: "Presentation access required" })
          : login,
        {
          status: 401,
          headers: {
            "content-type": url.pathname.startsWith("/api/")
              ? "application/json"
              : "text/html;charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    if (url.pathname.startsWith("/api/")) {
      const isUtn = url.pathname.startsWith("/api/utn/");
      const path = isUtn ? url.pathname.replace("/api/utn", "") : url.pathname;
      return env.STATE.getByName(isUtn ? "utn" : "ota").fetch(
        new Request(
          `https://${isUtn ? "utn" : "ota"}.internal${path}${url.search}`,
          request,
        ),
      );
    }
    return env.ASSETS.fetch(request);
  },
};
