# GitHub Profile PR Showcase and Workflow Design

Date: 2026-07-14

## Goal

Keep the existing GitHub profile structure while restoring the GitHub statistics cards, adding a compact dynamic pull-request showcase directly beneath them, and hardening the profile automation workflows.

The profile remains English by default and provides a link to a Chinese version.

## Scope

### In scope

- Restore GitHub Stats and Top Languages below the existing `GitHub Stats` heading.
- Add a native Markdown PR table between the statistics cards and the contribution snake.
- Generate that table from public, merged pull requests authored by `nev8rz` in external repositories.
- Exclude `vansin/intern-ai-doc`.
- Rank repositories by current star count and display at most six entries.
- Keep only the newest merged pull request for each repository.
- Add a Chinese README linked from the English README.
- Update the PR table in both README files automatically.
- Modernize and simplify the snake workflow.

### Out of scope

- A full visual redesign of the profile.
- Custom SVG PR cards or custom table colors.
- Open, closed-unmerged, draft, private, fork, or self-owned repository pull requests.
- Manually written summaries of pull requests.

## Profile Layout

The GitHub activity area uses this order:

1. GitHub Stats and Top Languages cards.
2. `Open Source Pull Requests` heading and generated PR table.
3. Contribution snake.
4. Profile view counter.

The PR showcase uses native GitHub Markdown so it follows the visitor's GitHub theme and remains selectable and accessible.

The statistics cards use separate `default` and `github_dark` image variants selected with `<picture>` media queries. They use hidden borders and no `radical` theme, keeping their appearance close to GitHub's own light and dark palettes.

The generated English table has four columns:

| Repository | Pull Request | Stars | Status |
| --- | --- | ---: | :---: |
| `owner/name` | `#number — title` | formatted current star count | `Merged` |

The Chinese README uses localized headings while preserving repository names and pull-request titles exactly as GitHub reports them.

Generated content is bounded by markers so the automation cannot overwrite unrelated profile content:

```markdown
<!-- PR-SHOWCASE:START -->
...
<!-- PR-SHOWCASE:END -->
```

## PR Selection and Ranking

The updater queries the GitHub GraphQL API for the complete merged pull-request history of `nev8rz`, following pagination.

It applies these rules in order:

1. Keep only merged pull requests in public repositories.
2. Remove pull requests to repositories owned by `nev8rz`.
3. Remove fork repositories.
4. Remove repositories in the explicit exclusion list, initially `vansin/intern-ai-doc`.
5. Group by repository and keep the most recently merged pull request in each group.
6. Sort groups by repository star count descending, then by merge time descending for ties.
7. Keep the first six rows.

As of 2026-07-14, the expected initial rows are `verl-project/verl#6167` and `SWE-agent/SWE-agent#1406`, in that order because `verl-project/verl` currently has more stars.

Star counts use a compact deterministic format: values below 1,000 are integers; larger values use one decimal-place `k` notation with a trailing `.0` removed.

## Components and Files

### Configuration

`config/pr-showcase.json` owns the changeable policy:

- profile username;
- maximum row count;
- excluded repositories;
- one-row-per-repository behavior.

### Generator

`scripts/update-pr-showcase.mjs`:

- reads configuration;
- fetches GraphQL data with pagination;
- filters and ranks pull requests;
- renders English and Chinese table variants;
- replaces only content inside the PR markers;
- writes a file only when its content changes.

Filtering, ranking, star formatting, escaping, and marker replacement are pure exported functions so they can be tested without network access.

### Tests

`tests/update-pr-showcase.test.mjs` uses Node's built-in test runner and fixtures. It covers:

- exclusions, forks, private repositories, and self-owned repositories;
- merged-only selection;
- newest pull request per repository;
- star-first ordering and merge-time tie-breaking;
- six-row limit;
- Markdown pipe escaping;
- compact star formatting;
- marker replacement and missing-marker failure;
- no-eligible-PR fallback text.

No npm dependencies or package installation are required.

## PR Showcase Workflow

`.github/workflows/pr-showcase.yml` runs daily at a non-round UTC minute and supports manual dispatch.

The workflow:

1. Checks out the default branch.
2. Sets up Node.js 24.
3. Runs the generator tests.
4. Runs the generator with `GITHUB_TOKEN`.
5. Stages only the two README files.
6. Exits successfully without a commit when there is no diff.
7. Otherwise commits as `github-actions[bot]` and pushes to the default branch.

Safety and reliability controls:

- explicit `contents: write` permission and no broader permission;
- workflow-level concurrency with stale runs canceled;
- five-minute timeout;
- schedule and manual dispatch only, avoiding self-trigger loops;
- current Node-compatible official actions;
- a rebase-before-push step to reduce races with a simultaneous user commit.

## Snake Workflow

`.github/workflows/snake.yml` remains independent because it writes the `output` branch rather than the README on `main`.

Changes:

- remove the unnecessary repository checkout step;
- remove the push trigger;
- retain daily scheduling and manual dispatch;
- use `github.repository_owner` instead of a hard-coded username;
- generate both light and dark SVG variants;
- add explicit `contents: write` permission;
- add workflow concurrency and a five-minute timeout;
- upgrade to `Platane/snk/svg-only@v3.5.0` and `crazy-max/ghaction-github-pages@v5`.

The README uses a `<picture>` element to select the light or dark snake automatically.

## Error Handling

- A GitHub API or GraphQL error fails the workflow before any README write, preserving the previous table.
- Missing README markers fail with a clear file-specific error.
- Invalid configuration fails before network access.
- Zero eligible pull requests produces a localized friendly placeholder instead of an empty table.
- An unchanged generated section produces no commit.
- A push race retries after rebasing; an unresolved conflict fails visibly rather than forcing a push.

## Verification

Implementation is complete only when:

- all Node tests pass locally;
- the generator dry run produces the two expected current rows in star-descending order;
- a second generator run produces no file diff;
- both workflow YAML files parse successfully;
- all local README links and image URLs are checked;
- the English and Chinese README structure is visually reviewed;
- the working-tree diff contains no `.superpowers` brainstorming artifacts.

## Acceptance Criteria

- The English profile remains the default and links to the Chinese README.
- GitHub Stats and Top Languages are visible again.
- The PR table appears immediately below the stats cards.
- Only eligible merged external pull requests appear.
- `vansin/intern-ai-doc` never appears.
- Rows are ordered by live repository stars and limited to six.
- Each row links to both the repository and the pull request.
- The snake renders in light and dark GitHub themes.
- Scheduled workflows do not run on every push.
- Automation commits occur only when generated README content changes.

## References

- [GitHub Actions concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
- [Platane/snk v3.5.0](https://github.com/Platane/snk/releases/tag/v3.5.0)
- [crazy-max/ghaction-github-pages v5.0.0](https://github.com/crazy-max/ghaction-github-pages/releases/tag/v5.0.0)
