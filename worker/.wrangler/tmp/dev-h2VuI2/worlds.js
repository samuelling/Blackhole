var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worlds.js
var CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "content-type, x-key", "access-control-max-age": "86400" };
var json = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } }), "json");
var ID = /^(s[a-z2-7]{16}|r-[BCDFGHJKLMNPQRSTVWXZ]{4})$/;
var PART = /^[a-z]{2,12}$/;
var KEEP = 12;
var CHUNK = 1 << 20;
var MAX_TOTAL = 24 << 20;
var MIN_GAP = 4e3;
var hex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var sha = /* @__PURE__ */ __name(async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), "sha");
var LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
var World = class {
  static {
    __name(this, "World");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS blob (h TEXT, i INTEGER, d TEXT, PRIMARY KEY (h, i));
      CREATE TABLE IF NOT EXISTS rev (n INTEGER PRIMARY KEY, t INTEGER, parts TEXT, size INTEGER)`);
  }
  meta(k) {
    const r = this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
    return r ? r.v : null;
  }
  setMeta(k, v) {
    this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));
  }
  latest() {
    return this.sql.exec("SELECT n, t, parts, size FROM rev ORDER BY n DESC LIMIT 1").toArray()[0] || null;
  }
  read(h) {
    return this.sql.exec("SELECT d FROM blob WHERE h = ? ORDER BY i", h).toArray().map((r) => r.d).join("");
  }
  async fetch(req) {
    const url = new URL(req.url), [, , id, what] = url.pathname.split("/");
    if (id[0] === "s") {
      const kh = this.meta("key"), given = req.headers.get("x-key") || "";
      if (given.length < 16 || given.length > 64) return json({ error: "key" }, 403);
      const h = await sha("gd-key:" + given);
      if (kh && kh !== h) return json({ error: "key" }, 403);
      if (!kh && req.method === "PUT") this.setMeta("key", h);
    }
    if (req.method === "GET") {
      if (what === "revs") return json(this.sql.exec("SELECT n AS rev, t, size FROM rev ORDER BY n DESC").toArray());
      const n = url.searchParams.get("rev"), r = n ? this.sql.exec("SELECT n, t, parts, size FROM rev WHERE n = ?", +n).toArray()[0] : this.latest();
      if (!r) return json({ error: "none" }, 404);
      const P = JSON.parse(r.parts);
      if (what === "meta") return json({ rev: r.n, t: r.t, hashes: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[0]])), sizes: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[1]])) });
      const parts = {};
      for (const [k, [h]] of Object.entries(P)) parts[k] = this.read(h);
      return json({ rev: r.n, t: r.t, parts });
    }
    if (req.method === "PUT") {
      const now = Date.now(), last = +(this.meta("put") || 0);
      if (now - last < MIN_GAP) return json({ error: "too soon", wait: MIN_GAP - (now - last) }, 429);
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "not json" }, 400);
      }
      const given = body && body.parts && typeof body.parts === "object" ? body.parts : null;
      if (!given) return json({ error: "no parts" }, 400);
      const prev = this.latest(), P = prev ? JSON.parse(prev.parts) : {};
      for (const [k, s] of Object.entries(given)) {
        if (!PART.test(k) || Object.keys(P).length > 12) return json({ error: "part " + k }, 400);
        if (s === null) {
          delete P[k];
          continue;
        }
        if (typeof s !== "string") return json({ error: "part " + k }, 400);
        const h = await sha(s);
        if (!this.sql.exec("SELECT 1 FROM blob WHERE h = ? LIMIT 1", h).toArray().length)
          for (let i = 0, j = 0; i < s.length || j === 0; i += CHUNK, j++) this.sql.exec("INSERT INTO blob (h, i, d) VALUES (?, ?, ?)", h, j, s.slice(i, i + CHUNK));
        P[k] = [h, s.length];
      }
      const size = Object.values(P).reduce((a, v) => a + v[1], 0);
      if (size > MAX_TOTAL) return json({ error: "too big", size }, 413);
      const n = (prev ? prev.n : 0) + 1;
      this.sql.exec("INSERT INTO rev (n, t, parts, size) VALUES (?, ?, ?, ?)", n, now, JSON.stringify(P), size);
      this.setMeta("put", now);
      this.sql.exec("DELETE FROM rev WHERE n <= ?", n - KEEP);
      const used = /* @__PURE__ */ new Set();
      for (const r of this.sql.exec("SELECT parts FROM rev").toArray()) for (const v of Object.values(JSON.parse(r.parts))) used.add(v[0]);
      for (const r of this.sql.exec("SELECT DISTINCT h FROM blob").toArray()) if (!used.has(r.h)) this.sql.exec("DELETE FROM blob WHERE h = ?", r.h);
      return json({ rev: n, t: now });
    }
    return json({ error: "method" }, 405);
  }
};
var worlds_default = {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url), seg = url.pathname.split("/");
    if (seg[1] === "room" && seg[2] === "new" && req.method === "GET") {
      for (let k = 0; k < 6; k++) {
        let c = "";
        for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        const r = await env.WORLD.get(env.WORLD.idFromName("r-" + c)).fetch(new Request(`https://w/w/r-${c}/meta`));
        if (r.status === 404) return json({ code: c });
      }
      return json({ error: "busy" }, 503);
    }
    if (seg[1] !== "w" || !ID.test(seg[2] || "") || seg.length > 4 || seg[3] && !["meta", "revs"].includes(seg[3])) return json({ error: "not found" }, 404);
    if (req.method === "PUT" && +(req.headers.get("content-length") || 0) > MAX_TOTAL + (1 << 20)) return json({ error: "too big" }, 413);
    return env.WORLD.get(env.WORLD.idFromName(seg[2])).fetch(req);
  }
};

// ../../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-8X7xUL/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worlds_default;

// ../../../../tmp/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-8X7xUL/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  World,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worlds.js.map
