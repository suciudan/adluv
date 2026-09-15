import assert from "node:assert/strict";
import test from "node:test";

import { getLocalDevCredentials, isLocalDevHost } from "./local-dev-auth";

test("quick login requires explicit development credentials", () => {
  assert.equal(getLocalDevCredentials({ NODE_ENV: "development" }), null);
  assert.equal(getLocalDevCredentials({ NODE_ENV: "development", LOCAL_DEV_AUTH_USERNAME: "admin", LOCAL_DEV_AUTH_PASSWORD: "short" }), null);
  const credentials = { LOCAL_DEV_AUTH_USERNAME: "tester", LOCAL_DEV_AUTH_PASSWORD: "test-only-password" };
  for (const mode of ["production", "test"] as const) {
    assert.equal(getLocalDevCredentials({ NODE_ENV: mode, ...credentials }), null);
  }
  assert.deepEqual(getLocalDevCredentials({ NODE_ENV: "development", ...credentials }), {
    username: "tester", password: "test-only-password",
  });
});

test("quick login only accepts loopback hosts", () => {
  for (const host of ["localhost:3001", "127.0.0.1:3001", "[::1]:3001"]) {
    assert.equal(isLocalDevHost(host), true);
  }
  for (const host of [null, "", "example.com", "localhost.example.com", "localhost,example.com", "localhost:3001@evil.example", "localhost/path"]) {
    assert.equal(isLocalDevHost(host), false);
  }
});
