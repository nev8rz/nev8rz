import assert from "node:assert/strict";
import test from "node:test";

import { validateConfig } from "../scripts/update-pr-showcase.mjs";

export const validConfig = {
  username: "nev8rz",
  maxItems: 6,
  excludedRepositories: ["vansin/intern-ai-doc"],
  onePerRepository: true,
};

test("validateConfig returns a normalized policy", () => {
  assert.deepEqual(validateConfig(validConfig), validConfig);
});

test("validateConfig rejects malformed policies", () => {
  const invalid = [
    { ...validConfig, username: "" },
    { ...validConfig, maxItems: 0 },
    { ...validConfig, maxItems: 1.5 },
    { ...validConfig, excludedRepositories: "vansin/intern-ai-doc" },
    { ...validConfig, excludedRepositories: ["missing-slash"] },
    { ...validConfig, onePerRepository: "true" },
  ];

  for (const config of invalid) {
    assert.throws(() => validateConfig(config), {
      message: "Invalid PR showcase config",
    });
  }
});
