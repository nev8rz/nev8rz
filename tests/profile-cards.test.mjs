import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readmePaths = ["README.md", "README.zh-CN.md"];
const cardPaths = [
  "./profile/stats-light.svg",
  "./profile/stats-dark.svg",
  "./profile/top-langs-light.svg",
  "./profile/top-langs-dark.svg",
];
const action =
  "stats-organization/github-readme-stats-action@f9d8133845f40d659a754f78b8484983ba766448";

test("profile READMEs use repository-local light and dark stats cards", () => {
  for (const path of readmePaths) {
    const readme = readFileSync(path, "utf8");
    assert.doesNotMatch(readme, /github-readme-stats\.vercel\.app/);
    for (const cardPath of cardPaths) assert.ok(readme.includes(cardPath));
  }
});

test("profile workflow generates and commits all four static cards", () => {
  const workflow = readFileSync(".github/workflows/pr-showcase.yml", "utf8");
  assert.ok(workflow.includes("run: node --test tests/*.test.mjs"));
  assert.equal(workflow.split(action).length - 1, 4);
  for (const path of cardPaths.map((path) => path.slice(2))) {
    assert.ok(workflow.includes(`path: ${path}`));
  }
  assert.ok(
    workflow.includes("git add README.md README.zh-CN.md profile/*.svg"),
  );
  assert.ok(
    workflow.includes(
      "git status --porcelain -- README.md README.zh-CN.md profile/",
    ),
  );
});
