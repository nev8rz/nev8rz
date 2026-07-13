# Profile PR Showcase and Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the profile statistics cards, add a star-ranked dynamic merged-PR table to English and Chinese READMEs, and harden the PR and contribution-snake workflows.

**Architecture:** A dependency-free Node.js module queries GitHub GraphQL, applies deterministic filtering and ranking, then atomically replaces bounded README sections. One daily workflow tests and runs the updater; a separate least-privilege workflow publishes light and dark snake assets.

**Tech Stack:** GitHub Flavored Markdown, Node.js 24 ESM with `node:test`, GitHub GraphQL API, GitHub Actions.

---

## File Map

- Create `.gitignore` — ignore visual brainstorming artifacts.
- Create `config/pr-showcase.json` — username, exclusions, limit, and grouping policy.
- Create `scripts/update-pr-showcase.mjs` — validation, selection, rendering, GraphQL pagination, and atomic updates.
- Create `tests/update-pr-showcase.test.mjs` — dependency-free behavior and adapter tests.
- Modify `README.md` — language link, restored stats, generated English table, theme-aware snake.
- Create `README.zh-CN.md` — Chinese mirror with generated Chinese table.
- Create `.github/workflows/pr-showcase.yml` — test, generate, and commit README changes.
- Modify `.github/workflows/snake.yml` — simplified pinned snake generation.

### Task 1: Configuration and validation

**Files:**
- Create: `.gitignore`
- Create: `config/pr-showcase.json`
- Create: `scripts/update-pr-showcase.mjs`
- Create: `tests/update-pr-showcase.test.mjs`

- [ ] **Step 1: Add configuration and ignore the companion output**

Create `.gitignore`:

```gitignore
.superpowers/
```

Create `config/pr-showcase.json`:

```json
{
  "username": "nev8rz",
  "maxItems": 6,
  "excludedRepositories": [
    "vansin/intern-ai-doc"
  ],
  "onePerRepository": true
}
```

- [ ] **Step 2: Write failing validation tests**

Create `tests/update-pr-showcase.test.mjs`:

```js
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
```

- [ ] **Step 3: Verify the test fails before implementation**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement configuration validation**

Create `scripts/update-pr-showcase.mjs`:

```js
function isRepositoryName(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return (
    parts.length === 2 &&
    parts.every((part) => part.trim().length > 0 && !part.includes(" "))
  );
}

export function validateConfig(config) {
  const valid =
    config &&
    typeof config.username === "string" &&
    config.username.trim().length > 0 &&
    Number.isInteger(config.maxItems) &&
    config.maxItems > 0 &&
    Array.isArray(config.excludedRepositories) &&
    config.excludedRepositories.every(isRepositoryName) &&
    typeof config.onePerRepository === "boolean";

  if (!valid) throw new Error("Invalid PR showcase config");

  return {
    username: config.username.trim(),
    maxItems: config.maxItems,
    excludedRepositories: [...config.excludedRepositories],
    onePerRepository: config.onePerRepository,
  };
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
git add .gitignore config/pr-showcase.json scripts/update-pr-showcase.mjs tests/update-pr-showcase.test.mjs
git commit -m "feat: add PR showcase configuration"
```

Expected: 2 tests PASS, then one commit.

### Task 2: Selection, ranking, rendering, and markers

**Files:**
- Modify: `scripts/update-pr-showcase.mjs`
- Modify: `tests/update-pr-showcase.test.mjs`

- [ ] **Step 1: Extend the test import and add a fixture**

Replace the module import in `tests/update-pr-showcase.test.mjs` with:

```js
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
```

Append:

```js
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
```

- [ ] **Step 2: Add failing filtering and ranking tests**

Append:

```js
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
```

- [ ] **Step 3: Add failing rendering and marker tests**

Append:

```js
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
```

- [ ] **Step 4: Run tests and verify the missing exports**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
```

Expected: FAIL because the new functions are not exported.

- [ ] **Step 5: Implement the pure functions**

Append to `scripts/update-pr-showcase.mjs`:

```js
export const START_MARKER = "<!-- PR-SHOWCASE:START -->";
export const END_MARKER = "<!-- PR-SHOWCASE:END -->";

const COPY = {
  en: {
    headers: ["Repository", "Pull Request", "Stars", "Status"],
    merged: "Merged",
    empty: "_No eligible merged pull requests yet._",
  },
  "zh-CN": {
    headers: ["仓库", "Pull Request", "Stars", "状态"],
    merged: "已合并",
    empty: "_暂无符合条件的已合并 Pull Request。_",
  },
};

export function formatStars(count) {
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Invalid star count: ${count}`);
  }
  if (count < 1_000) return String(Math.trunc(count));
  const compact = (count / 1_000).toFixed(1);
  return `${compact.endsWith(".0") ? compact.slice(0, -2) : compact}k`;
}

export function escapeMarkdown(value) {
  return String(value).replaceAll("|", "&#124;");
}

function mergedTimestamp(pullRequest) {
  return Date.parse(pullRequest.mergedAt);
}

export function selectPullRequests(pullRequests, rawConfig) {
  const config = validateConfig(rawConfig);
  const excluded = new Set(
    config.excludedRepositories.map((repository) => repository.toLowerCase()),
  );

  let selected = pullRequests.filter((pullRequest) => {
    const repository = pullRequest?.repository;
    return (
      pullRequest?.state === "MERGED" &&
      Number.isFinite(mergedTimestamp(pullRequest)) &&
      repository &&
      !repository.isPrivate &&
      !repository.isFork &&
      repository.owner?.login?.toLowerCase() !== config.username.toLowerCase() &&
      !excluded.has(repository.nameWithOwner.toLowerCase())
    );
  });

  if (config.onePerRepository) {
    const newestByRepository = new Map();
    for (const pullRequest of selected) {
      const key = pullRequest.repository.nameWithOwner.toLowerCase();
      const existing = newestByRepository.get(key);
      if (!existing || mergedTimestamp(pullRequest) > mergedTimestamp(existing)) {
        newestByRepository.set(key, pullRequest);
      }
    }
    selected = [...newestByRepository.values()];
  }

  selected.sort(
    (left, right) =>
      right.repository.stargazerCount - left.repository.stargazerCount ||
      mergedTimestamp(right) - mergedTimestamp(left) ||
      left.repository.nameWithOwner.localeCompare(
        right.repository.nameWithOwner,
      ),
  );

  return selected.slice(0, config.maxItems);
}

export function renderTable(pullRequests, locale) {
  const copy = COPY[locale];
  if (!copy) throw new Error(`Unsupported locale: ${locale}`);
  if (pullRequests.length === 0) return copy.empty;

  const rows = pullRequests.map((pullRequest) => {
    const repository = pullRequest.repository;
    const repositoryCell =
      `[${escapeMarkdown(repository.nameWithOwner)}](${repository.url})`;
    const pullRequestCell =
      `[#${pullRequest.number} — ${escapeMarkdown(pullRequest.title)}](${pullRequest.url})`;
    return `| ${repositoryCell} | ${pullRequestCell} | ${formatStars(repository.stargazerCount)} | ${copy.merged} |`;
  });

  return [
    `| ${copy.headers.join(" | ")} |`,
    "| --- | --- | ---: | :---: |",
    ...rows,
  ].join("\n");
}

export function replaceSection(source, generated, filePath) {
  const startIndex = source.indexOf(START_MARKER);
  const endIndex = source.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `${filePath}: missing or misordered PR showcase markers`,
    );
  }

  return (
    source.slice(0, startIndex + START_MARKER.length) +
    `\n\n${generated}\n\n` +
    source.slice(endIndex)
  );
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
git add scripts/update-pr-showcase.mjs tests/update-pr-showcase.test.mjs
git commit -m "feat: render ranked merged PR table"
```

Expected: all tests PASS, then one commit.

### Task 3: GraphQL pagination and atomic updates

**Files:**
- Modify: `scripts/update-pr-showcase.mjs`
- Modify: `tests/update-pr-showcase.test.mjs`

- [ ] **Step 1: Add failing GraphQL and multi-file tests**

Add `buildReadmeUpdates` and `fetchMergedPullRequests` to the existing import, then append:

```js
test("fetchMergedPullRequests follows pagination", async () => {
  const payloads = [
    {
      data: {
        user: {
          pullRequests: {
            pageInfo: { hasNextPage: true, endCursor: "next" },
            nodes: [pullRequest({ number: 1 })],
          },
        },
      },
    },
    {
      data: {
        user: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [pullRequest({ number: 2 })],
          },
        },
      },
    },
  ];
  const variables = [];
  const fetchImpl = async (_url, options) => {
    variables.push(JSON.parse(options.body).variables);
    return { ok: true, json: async () => payloads.shift() };
  };

  const result = await fetchMergedPullRequests({
    token: "token",
    username: "nev8rz",
    fetchImpl,
  });

  assert.deepEqual(result.map(({ number }) => number), [1, 2]);
  assert.deepEqual(variables, [
    { username: "nev8rz", after: null },
    { username: "nev8rz", after: "next" },
  ]);
});

test("fetchMergedPullRequests surfaces HTTP and GraphQL errors", async () => {
  await assert.rejects(
    fetchMergedPullRequests({
      token: "token",
      username: "nev8rz",
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        text: async () => "unavailable",
      }),
    }),
    { message: "GitHub GraphQL request failed with 503: unavailable" },
  );

  await assert.rejects(
    fetchMergedPullRequests({
      token: "token",
      username: "nev8rz",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ errors: [{ message: "rate limited" }] }),
      }),
    }),
    { message: "GitHub GraphQL error: rate limited" },
  );
});

test("buildReadmeUpdates prepares both locales or throws", () => {
  const source = [START_MARKER, "old", END_MARKER, ""].join("\n");
  const updates = buildReadmeUpdates(
    { "README.md": source, "README.zh-CN.md": source },
    [pullRequest()],
  );
  assert.equal(updates.length, 2);
  assert.ok(updates[0].content.includes("Repository"));
  assert.ok(updates[1].content.includes("仓库"));

  assert.throws(
    () =>
      buildReadmeUpdates(
        { "README.md": source, "README.zh-CN.md": "missing" },
        [pullRequest()],
      ),
    {
      message:
        "README.zh-CN.md: missing or misordered PR showcase markers",
    },
  );
});
```

- [ ] **Step 2: Verify tests fail for missing exports**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
```

Expected: FAIL for the missing GraphQL and update exports.

- [ ] **Step 3: Add runtime imports and GraphQL implementation**

Add at the top of `scripts/update-pr-showcase.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
```

Append:

```js
const GRAPHQL_QUERY = `
  query($username: String!, $after: String) {
    user(login: $username) {
      pullRequests(
        first: 100
        after: $after
        states: [MERGED]
        orderBy: { field: CREATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          state
          mergedAt
          repository {
            nameWithOwner
            url
            stargazerCount
            isPrivate
            isFork
            owner { login }
          }
        }
      }
    }
  }
`;

const README_TARGETS = [
  { path: "README.md", locale: "en" },
  { path: "README.zh-CN.md", locale: "zh-CN" },
];

export async function fetchMergedPullRequests({
  token,
  username,
  fetchImpl = fetch,
}) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const pullRequests = [];
  let after = null;

  for (;;) {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "nev8rz-profile-pr-showcase",
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables: { username, after },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub GraphQL request failed with ${response.status}: ${await response.text()}`,
      );
    }
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${payload.errors.map(({ message }) => message).join("; ")}`,
      );
    }
    const connection = payload.data?.user?.pullRequests;
    if (!connection) throw new Error(`GitHub user not found: ${username}`);

    pullRequests.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return pullRequests;
}

export function buildReadmeUpdates(readmes, pullRequests) {
  return README_TARGETS.map(({ path, locale }) => {
    const source = readmes[path];
    if (typeof source !== "string") {
      throw new Error(`Missing README source: ${path}`);
    }
    const content = replaceSection(
      source,
      renderTable(pullRequests, locale),
      path,
    );
    return { path, content, changed: content !== source };
  });
}

async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, "utf8")));
}

export async function main() {
  const configPath =
    process.env.PR_SHOWCASE_CONFIG ?? "config/pr-showcase.json";
  const config = await loadConfig(configPath);
  const allPullRequests = await fetchMergedPullRequests({
    token: process.env.GITHUB_TOKEN,
    username: config.username,
  });
  const selected = selectPullRequests(allPullRequests, config);
  const readmes = Object.fromEntries(
    await Promise.all(
      README_TARGETS.map(async ({ path }) => [path, await readFile(path, "utf8")]),
    ),
  );
  const updates = buildReadmeUpdates(readmes, selected);

  await Promise.all(
    updates
      .filter(({ changed }) => changed)
      .map(({ path, content }) => writeFile(path, content)),
  );

  const changed = updates.filter(({ changed }) => changed).map(({ path }) => path);
  console.log(
    changed.length
      ? `Updated ${changed.join(", ")} with ${selected.length} pull requests.`
      : `PR showcase already current (${selected.length} pull requests).`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Test the adapter and safe failure path**

Run:

```bash
node --test tests/update-pr-showcase.test.mjs
env -u GITHUB_TOKEN node scripts/update-pr-showcase.mjs
```

Expected: tests PASS; the second command exits 1 with `GITHUB_TOKEN is required` before any README write.

- [ ] **Step 5: Commit the updater**

```bash
git add scripts/update-pr-showcase.mjs tests/update-pr-showcase.test.mjs
git commit -m "feat: update PR showcase from GitHub"
```

### Task 4: Restore stats and add bilingual PR sections

**Files:**
- Modify: `README.md`
- Create: `README.zh-CN.md`

- [ ] **Step 1: Add the English language switch**

Insert immediately below the first heading in `README.md`:

```html
<p align="right">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>
```

- [ ] **Step 2: Replace the current GitHub Stats and snake block**

Use this exact block:

```html
### 📊 GitHub Stats

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-readme-stats.vercel.app/api?username=nev8rz&amp;show_icons=true&amp;hide_border=true&amp;theme=github_dark">
    <img height="165" src="https://github-readme-stats.vercel.app/api?username=nev8rz&amp;show_icons=true&amp;hide_border=true&amp;theme=default" alt="Yijin Zhou's GitHub stats">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-readme-stats.vercel.app/api/top-langs/?username=nev8rz&amp;layout=compact&amp;hide_border=true&amp;theme=github_dark">
    <img height="165" src="https://github-readme-stats.vercel.app/api/top-langs/?username=nev8rz&amp;layout=compact&amp;hide_border=true&amp;theme=default" alt="Most used languages">
  </picture>
</p>

### 🔀 Open Source Pull Requests

<!-- PR-SHOWCASE:START -->

_The dynamic PR showcase will appear here._

<!-- PR-SHOWCASE:END -->

<p align="center">
  <a href="https://github.com/nev8rz/nev8rz/actions/workflows/snake.yml">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nev8rz/nev8rz/output/github-contribution-grid-snake-dark.svg">
      <img src="https://raw.githubusercontent.com/nev8rz/nev8rz/output/github-contribution-grid-snake.svg" alt="GitHub contribution snake animation">
    </picture>
  </a>
</p>
```

- [ ] **Step 3: Create the complete translated mirror**

Create `README.zh-CN.md`:

```markdown
# 你好，我是 Yijin Zhou！👋

<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

### 🎓 教育背景

- 中国科学技术大学软件工程学院硕士研究生

### 🚀 关于我

- 🔭 目前在中国科学技术大学攻读硕士学位
- 🌱 关注 AI 与软件开发
- 💡 喜欢探索新技术并构建有趣、实用的项目
- 🎯 致力于打造高效、可扩展的软件系统

### 🛠️ 技术栈

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Shell](https://img.shields.io/badge/Shell-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)

### 📫 联系方式

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/nev8rz)
[![Email](https://img.shields.io/badge/Email-zyjm%40mail.ustc.edu.cn-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:zyjm@mail.ustc.edu.cn)

### 📊 GitHub 数据

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-readme-stats.vercel.app/api?username=nev8rz&amp;show_icons=true&amp;hide_border=true&amp;theme=github_dark">
    <img height="165" src="https://github-readme-stats.vercel.app/api?username=nev8rz&amp;show_icons=true&amp;hide_border=true&amp;theme=default" alt="Yijin Zhou 的 GitHub 数据">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-readme-stats.vercel.app/api/top-langs/?username=nev8rz&amp;layout=compact&amp;hide_border=true&amp;theme=github_dark">
    <img height="165" src="https://github-readme-stats.vercel.app/api/top-langs/?username=nev8rz&amp;layout=compact&amp;hide_border=true&amp;theme=default" alt="常用编程语言">
  </picture>
</p>

### 🔀 开源 Pull Request

<!-- PR-SHOWCASE:START -->

_动态 PR 展示将在这里生成。_

<!-- PR-SHOWCASE:END -->

<p align="center">
  <a href="https://github.com/nev8rz/nev8rz/actions/workflows/snake.yml">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nev8rz/nev8rz/output/github-contribution-grid-snake-dark.svg">
      <img src="https://raw.githubusercontent.com/nev8rz/nev8rz/output/github-contribution-grid-snake.svg" alt="GitHub 贡献蛇形动画">
    </picture>
  </a>
</p>

---

<p align="center">
  <img src="https://komarev.com/ghpvc/?username=nev8rz&amp;color=blueviolet&amp;style=flat-square" alt="主页访问量">
</p>
```

- [ ] **Step 4: Generate live rows and verify idempotence**

Run:

```bash
GITHUB_TOKEN="$(gh auth token)" node scripts/update-pr-showcase.mjs
rg -n "verl-project/verl|SWE-agent/SWE-agent" README.md README.zh-CN.md
! rg -n "vansin/intern-ai-doc" README.md README.zh-CN.md
before="$(shasum README.md README.zh-CN.md)"
GITHUB_TOKEN="$(gh auth token)" node scripts/update-pr-showcase.mjs
after="$(shasum README.md README.zh-CN.md)"
test "$before" = "$after"
```

Expected: both READMEs contain `verl-project/verl` before `SWE-agent/SWE-agent`, neither contains the excluded repository, and the second run changes no bytes.

- [ ] **Step 5: Commit the profile layout**

```bash
git add README.md README.zh-CN.md
git commit -m "feat: show ranked open source pull requests"
```

### Task 5: Daily PR workflow

**Files:**
- Create: `.github/workflows/pr-showcase.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Update PR Showcase

on:
  schedule:
    - cron: "17 2 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: pr-showcase-${{ github.ref }}
  cancel-in-progress: true

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0

      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: "24"

      - name: Test generator
        run: node --test tests/update-pr-showcase.test.mjs

      - name: Update PR showcase
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/update-pr-showcase.mjs

      - name: Commit changes
        run: |
          if git diff --quiet -- README.md README.zh-CN.md; then
            echo "PR showcase is already current."
            exit 0
          fi

          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add README.md README.zh-CN.md
          git commit -m "chore: update PR showcase"
          git pull --rebase origin "${GITHUB_REF_NAME}"
          git push origin "HEAD:${GITHUB_REF_NAME}"
```

- [ ] **Step 2: Parse, test, and commit**

Run:

```bash
ruby -e 'require "psych"; Psych.parse_file(ARGV.fetch(0)); puts "valid"' .github/workflows/pr-showcase.yml
node --test tests/update-pr-showcase.test.mjs
git add .github/workflows/pr-showcase.yml
git commit -m "ci: update PR showcase daily"
```

Expected: YAML prints `valid`, all tests PASS, then one commit.

### Task 6: Snake workflow and final verification

**Files:**
- Modify: `.github/workflows/snake.yml`

- [ ] **Step 1: Replace the workflow**

```yaml
name: Generate Contribution Snake

on:
  schedule:
    - cron: "23 1 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: contribution-snake
  cancel-in-progress: true

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Generate light and dark snakes
        uses: Platane/snk/svg-only@d8f6715049803e982ee5ff501b6b9b7d5deeb09b # v3.5.0
        with:
          github_user_name: ${{ github.repository_owner }}
          outputs: |
            dist/github-contribution-grid-snake.svg
            dist/github-contribution-grid-snake-dark.svg?palette=github-dark

      - name: Publish to output branch
        uses: crazy-max/ghaction-github-pages@1d6ee9b181a81033a16bd707a1401afa978daab4 # v5.0.0
        with:
          target_branch: output
          build_dir: dist
          allow_empty_commit: false
          commit_message: "chore: update contribution snake"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Parse workflows and run the complete suite**

Run:

```bash
ruby -e 'require "psych"; ARGV.each { |path| Psych.parse_file(path); puts "valid #{path}" }' .github/workflows/pr-showcase.yml .github/workflows/snake.yml
node --test tests/update-pr-showcase.test.mjs
GITHUB_TOKEN="$(gh auth token)" node scripts/update-pr-showcase.mjs
git diff --check
```

Expected: both YAML files parse, all tests PASS, the generator reports the READMEs are current, and `git diff --check` has no output.

- [ ] **Step 3: Check external image endpoints**

Run:

```bash
curl -fsSL --retry 2 -o /dev/null "https://github-readme-stats.vercel.app/api?username=nev8rz&show_icons=true&hide_border=true&theme=default"
curl -fsSL --retry 2 -o /dev/null "https://github-readme-stats.vercel.app/api/top-langs/?username=nev8rz&layout=compact&hide_border=true&theme=default"
curl -fsSL --retry 2 -o /dev/null "https://raw.githubusercontent.com/nev8rz/nev8rz/output/github-contribution-grid-snake.svg"
```

Expected: every command exits 0.

- [ ] **Step 4: Review scope and stale patterns**

Run:

```bash
rg -n "actions/checkout@v3|github_user_name: nev8rz" .github/workflows || true
rg -n "vansin/intern-ai-doc" README.md README.zh-CN.md || true
git status --short
git diff --stat HEAD~5
```

Expected: the two `rg` commands print nothing; `.superpowers/` is absent from status; changes are limited to the plan, configuration, generator, tests, READMEs, and workflows.

- [ ] **Step 5: Commit and verify**

Run:

```bash
git add .github/workflows/snake.yml
git commit -m "ci: harden contribution snake workflow"
node --test tests/update-pr-showcase.test.mjs
git status --short
git log --oneline -7
```

Expected: tests PASS; worktree is clean; recent history contains the design, plan, generator, profile, PR workflow, and snake commits.
