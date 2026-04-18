import { expect, test } from "@playwright/test";

/**
 * Validates static preview server behavior for
 * https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md
 */
test("GET with Accept preferring text/markdown returns markdown", async ({ request }) => {
  const response = await request.get(".", {
    headers: {
      Accept: "text/markdown, text/html;q=0.5",
    },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/markdown");
  expect(response.headers()["vary"]?.toLowerCase()).toContain("accept");
  const tokens = response.headers()["x-markdown-tokens"];
  expect(tokens).toBeTruthy();
  expect(Number.parseInt(tokens ?? "", 10)).toBeGreaterThan(0);

  const body = await response.text();
  expect(body.length).toBeGreaterThan(100);
});
