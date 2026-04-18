import { expect, test } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4401);

test("serves OAuth Protected Resource Metadata at /.well-known/oauth-protected-resource", async ({
  request,
}) => {
  const response = await request.get(
    `http://127.0.0.1:${port}/agent-render/.well-known/oauth-protected-resource`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/application\/json/);

  const body = await response.json();
  expect(body).toMatchObject({
    resource: "https://agent-render.com/agent-render",
    authorization_servers: [],
    scopes_supported: [],
  });
});
