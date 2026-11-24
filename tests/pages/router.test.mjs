import test from "node:test";
import assert from "node:assert/strict";
import {route} from "../../deploy/cloudflare-router/worker.mjs";

test("anonymous reads use Pages without cookies, authenticated routes stay on AWS", async () => {
  for (const [path,cookie,aws] of [["/posts/project/94","other=abc",false],["/","blog.session=test",true],["/login","",true],["/api/auth/me","",true]]) {
    const result = await route(new Request("https://crusthack.com"+path,{headers:{Cookie:cookie}}), async req => {
      assert.equal(new URL(req.url).hostname, aws ? "app.crusthack.com" : "crusthack.com");
      assert.equal(req.headers.get("Cookie"),aws ? cookie : null);
      return new Response(null,{status:302,headers:{location:"https://app.crusthack.com/admin"}});
    });
    if(aws) assert.equal(result.headers.get("location"),"https://crusthack.com/admin");
  }
});

test("public documents fall back to anonymous Pages when AWS is unavailable", async () => {
  for (const failure of [() => new Response(null, {status: 521}), () => { throw new TypeError("unreachable"); }]) {
    const hosts = [];
    const result = await route(new Request("https://crusthack.com/posts/project/94/", {
      headers: {Cookie: "blog.session=test", Authorization: "Bearer test"},
    }), async req => {
      hosts.push(new URL(req.url).hostname);
      if (hosts.length === 1) return failure();
      assert.equal(req.headers.has("cookie"), false);
      assert.equal(req.headers.has("authorization"), false);
      return new Response("published");
    });
    assert.deepEqual(hosts, ["app.crusthack.com", "crusthack.com"]);
    assert.equal(await result.text(), "published");
  }
});

test("public tools and attachments work without AWS; private operations never fall back", async () => {
  for (const path of ["/game/", "/markdown/", "/static/assets/1/file.png"]) {
    const response = await route(new Request("https://crusthack.com" + path), async req => {
      assert.equal(new URL(req.url).hostname, "crusthack.com");
      return new Response("static");
    });
    assert.equal(response.status, 200);
  }
  for (const [path, method] of [["/admin", "GET"], ["/api/posts", "POST"], ["/write", "GET"]]) {
    const response = await route(new Request("https://crusthack.com" + path, {method}), async req => {
      assert.equal(new URL(req.url).hostname, "app.crusthack.com");
      return new Response(null, {status: 521});
    });
    assert.equal(response.status, 521);
  }
});
