import assert from "node:assert/strict";
import test from "node:test";

import {
  END_MARKER,
  START_MARKER,
  escapeMarkdown,
  formatStars,
  renderTable,
  replaceSection,
  selectPullRequests,
  validateConfig,
} from "../scripts/update-pr-showcase.mjs";

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

function pullRequest(overrides = {}) {
  return {
    number: 1406,
    title: "Fix repository detection",
    url: "https://github.com/SWE-agent/SWE-agent/pull/1406",
    state: "MERGED",
    mergedAt: "2026-06-06T00:42:25Z",
    repository: {
      nameWithOwner: "SWE-agent/SWE-agent",
      url: "https://github.com/SWE-agent/SWE-agent",
      stargazerCount: 19_792,
      isPrivate: false,
      isFork: false,
      owner: { login: "SWE-agent" },
    },
    ...overrides,
  };
}

test("selectPullRequests filters ineligible entries", () => {
  const repository = pullRequest().repository;
  const selected = selectPullRequests(
    [
      pullRequest(),
      pullRequest({ number: 1, state: "OPEN" }),
      pullRequest({
        number: 2,
        repository: {
          ...repository,
          nameWithOwner: "vansin/intern-ai-doc",
          owner: { login: "vansin" },
        },
      }),
      pullRequest({ number: 3, repository: { ...repository, isPrivate: true } }),
      pullRequest({ number: 4, repository: { ...repository, isFork: true } }),
      pullRequest({
        number: 5,
        repository: {
          ...repository,
          nameWithOwner: "nev8rz/private-project",
          owner: { login: "nev8rz" },
        },
      }),
    ],
    validConfig,
  );

  assert.deepEqual(selected.map(({ number }) => number), [1406]);
});

test("selection keeps the newest PR per repo and ranks by stars", () => {
  const selected = selectPullRequests(
    [
      pullRequest({ number: 1405, mergedAt: "2026-01-01T00:00:00Z" }),
      pullRequest(),
      pullRequest({
        number: 6167,
        title: "Preserve native JSONL types",
        mergedAt: "2026-04-27T11:02:29Z",
        repository: {
          nameWithOwner: "verl-project/verl",
          url: "https://github.com/verl-project/verl",
          stargazerCount: 22_449,
          isPrivate: false,
          isFork: false,
          owner: { login: "verl-project" },
        },
      }),
    ],
    validConfig,
  );

  assert.deepEqual(selected.map(({ number }) => number), [6167, 1406]);
});

test("selection uses merge time for star-count ties and enforces maxItems", () => {
  const requests = Array.from({ length: 8 }, (_, index) =>
    pullRequest({
      number: index,
      mergedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      repository: {
        ...pullRequest().repository,
        nameWithOwner: `owner/repo-${index}`,
        url: `https://github.com/owner/repo-${index}`,
        stargazerCount: 100,
        owner: { login: "owner" },
      },
    }),
  );

  const selected = selectPullRequests(requests, validConfig);
  assert.equal(selected.length, 6);
  assert.deepEqual(selected.map(({ number }) => number), [7, 6, 5, 4, 3, 2]);
});

test("star and Markdown formatting is deterministic", () => {
  assert.equal(formatStars(999), "999");
  assert.equal(formatStars(1_000), "1k");
  assert.equal(formatStars(1_250), "1.3k");
  assert.equal(formatStars(22_449), "22.4k");
  assert.equal(escapeMarkdown("Fix JSON | paths"), "Fix JSON &#124; paths");
});

test("renderTable creates localized linked rows and fallback copy", () => {
  const selected = selectPullRequests([pullRequest()], validConfig);
  const english = renderTable(selected, "en");
  const chinese = renderTable(selected, "zh-CN");

  assert.ok(english.includes("| Repository | Pull Request | Stars | Status |"));
  assert.ok(english.includes("[#1406 — Fix repository detection]"));
  assert.ok(english.includes("| 19.8k | Merged |"));
  assert.ok(chinese.includes("| 仓库 | Pull Request | Stars | 状态 |"));
  assert.ok(chinese.includes("| 19.8k | 已合并 |"));
  assert.equal(renderTable([], "en"), "_No eligible merged pull requests yet._");
  assert.equal(
    renderTable([], "zh-CN"),
    "_暂无符合条件的已合并 Pull Request。_",
  );
});

test("replaceSection is bounded and idempotent", () => {
  const source = ["before", START_MARKER, "old", END_MARKER, "after", ""].join(
    "\n",
  );
  const updated = replaceSection(source, "new", "README.md");

  assert.equal(
    updated,
    ["before", START_MARKER, "", "new", "", END_MARKER, "after", ""].join(
      "\n",
    ),
  );
  assert.equal(replaceSection(updated, "new", "README.md"), updated);
  assert.throws(() => replaceSection("missing", "new", "README.md"), {
    message: "README.md: missing or misordered PR showcase markers",
  });
});
