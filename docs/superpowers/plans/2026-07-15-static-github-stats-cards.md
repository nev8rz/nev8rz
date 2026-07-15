# Static GitHub Stats Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken public GitHub Readme Stats endpoints with light and dark static SVG cards generated inside the profile repository.

**Architecture:** Add a repository-level contract test for the two READMEs and the existing profile workflow. Extend that workflow to generate four static cards with a SHA-pinned action, then commit those cards atomically with the bilingual PR table updates. Roll out by dispatching the workflow and verifying the generated assets and live GitHub rendering.

**Tech Stack:** Node.js built-in test runner, GitHub Actions YAML, `stats-organization/github-readme-stats-action`, GitHub Markdown/HTML.

---

### Task 1: Add a failing profile-card contract test

**Files:**
- Create: `tests/profile-cards.test.mjs`
- Read: `README.md`
- Read: `README.zh-CN.md`
- Read: `.github/workflows/pr-showcase.yml`

- [ ] **Step 1: Create the repository-level test**

```js
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
  assert.equal(workflow.split(action).length - 1, 4);
  for (const path of cardPaths.map((path) => path.slice(2))) {
    assert.ok(workflow.includes(`path: ${path}`));
  }
  assert.ok(
    workflow.includes("git add README.md README.zh-CN.md profile/*.svg"),
  );
  assert.ok(
    workflow.includes(
      'git status --porcelain -- README.md README.zh-CN.md profile/',
    ),
  );
});
```

- [ ] **Step 2: Run the test and confirm the RED state**

Run:

```bash
node --test tests/profile-cards.test.mjs
```

Expected: two failures. The READMEs still contain `github-readme-stats.vercel.app`, and the workflow does not yet contain the pinned card-generation action.

### Task 2: Generate static cards and reference them from both READMEs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `.github/workflows/pr-showcase.yml`
- Test: `tests/profile-cards.test.mjs`

- [ ] **Step 1: Replace the English README card sources**

Use this GitHub Stats block in `README.md`:

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./profile/stats-dark.svg">
    <img height="165" src="./profile/stats-light.svg" alt="Yijin Zhou's GitHub stats">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./profile/top-langs-dark.svg">
    <img height="165" src="./profile/top-langs-light.svg" alt="Most used languages">
  </picture>
</p>
```

- [ ] **Step 2: Replace the Chinese README card sources**

Use the same four local paths in `README.zh-CN.md`, preserving the Chinese alt text:

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./profile/stats-dark.svg">
    <img height="165" src="./profile/stats-light.svg" alt="Yijin Zhou 的 GitHub 数据">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./profile/top-langs-dark.svg">
    <img height="165" src="./profile/top-langs-light.svg" alt="常用编程语言">
  </picture>
</p>
```

- [ ] **Step 3: Add four card-generation steps to the existing workflow**

Insert these steps after Node setup and before the PR generator runs:

```yaml
      - name: Generate light stats card
        uses: stats-organization/github-readme-stats-action@f9d8133845f40d659a754f78b8484983ba766448 # v2
        with:
          card: stats
          options: "username=${{ github.repository_owner }}&show_icons=true&hide_border=true&theme=default"
          path: profile/stats-light.svg
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate dark stats card
        uses: stats-organization/github-readme-stats-action@f9d8133845f40d659a754f78b8484983ba766448 # v2
        with:
          card: stats
          options: "username=${{ github.repository_owner }}&show_icons=true&hide_border=true&theme=github_dark"
          path: profile/stats-dark.svg
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate light top languages card
        uses: stats-organization/github-readme-stats-action@f9d8133845f40d659a754f78b8484983ba766448 # v2
        with:
          card: top-langs
          options: "username=${{ github.repository_owner }}&layout=compact&hide_border=true&theme=default"
          path: profile/top-langs-light.svg
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate dark top languages card
        uses: stats-organization/github-readme-stats-action@f9d8133845f40d659a754f78b8484983ba766448 # v2
        with:
          card: top-langs
          options: "username=${{ github.repository_owner }}&layout=compact&hide_border=true&theme=github_dark"
          path: profile/top-langs-dark.svg
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Make the workflow commit generated cards atomically**

Change the diff and staging commands to:

```yaml
          if [ -z "$(git status --porcelain -- README.md README.zh-CN.md profile/)" ]; then
            echo "Profile showcase is already current."
            exit 0
          fi

          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add README.md README.zh-CN.md profile/*.svg
          git commit -m "chore: update profile showcase"
```

- [ ] **Step 5: Run the focused test and confirm the GREEN state**

Run:

```bash
node --test tests/profile-cards.test.mjs
```

Expected: 2 tests pass and 0 fail.

- [ ] **Step 6: Run repository verification**

Run:

```bash
node --test tests/*.test.mjs
ruby -e 'require "psych"; ARGV.each { |path| Psych.parse_file(path); puts "valid #{path}" }' .github/workflows/pr-showcase.yml .github/workflows/snake.yml
git diff --check
```

Expected: all Node tests pass, both workflow files parse, and `git diff --check` prints nothing.

- [ ] **Step 7: Commit the tested implementation**

```bash
git add tests/profile-cards.test.mjs README.md README.zh-CN.md .github/workflows/pr-showcase.yml
git commit -m "fix: generate reliable GitHub stats cards"
```

### Task 3: Generate the initial SVG assets and verify the live profile

**Files:**
- Generate through workflow: `profile/stats-light.svg`
- Generate through workflow: `profile/stats-dark.svg`
- Generate through workflow: `profile/top-langs-light.svg`
- Generate through workflow: `profile/top-langs-dark.svg`

- [ ] **Step 1: Push the tested commits to main**

```bash
git push origin main
```

Expected: the design, plan, test, README, and workflow commits are accepted by `origin/main`.

- [ ] **Step 2: Dispatch and watch the profile workflow**

```bash
gh workflow run pr-showcase.yml --ref main
run_id=$(gh run list --workflow pr-showcase.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --exit-status
```

Expected: the workflow completes successfully and commits the four SVG files to `main`.

- [ ] **Step 3: Synchronize and validate generated assets**

```bash
git pull --ff-only origin main
test -s profile/stats-light.svg
test -s profile/stats-dark.svg
test -s profile/top-langs-light.svg
test -s profile/top-langs-dark.svg
ruby -r rexml/document -e 'ARGV.each { |path| REXML::Document.new(File.read(path)); puts "valid #{path}" }' profile/*.svg
node --test tests/*.test.mjs
git status --short --branch
```

Expected: four non-empty, valid SVG files; all tests pass; `main` is synchronized and clean.

- [ ] **Step 4: Verify the original symptom on GitHub**

Reload `https://github.com/nev8rz` in the existing browser tab. Check the two card images by alt text and confirm `complete === true`, `naturalWidth > 0`, and `naturalHeight > 0`. Capture a full-page screenshot for visual inspection.

Expected: the Stats and Top Languages cards are visible instead of their alt text, while the PR table and snake remain visible.
