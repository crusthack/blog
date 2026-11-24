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
