# Static GitHub Stats Cards Design

## Context

The profile README currently embeds the public `github-readme-stats.vercel.app` endpoint. Both cards render as broken images on GitHub: the proxied images complete with a natural size of `0 × 0`. The upstream project reports that its public deployment is paused and recommends generating static SVG cards with GitHub Actions.

The pull request table and contribution snake are rendering correctly and remain out of scope for visual redesign.

## Goal

Keep the existing GitHub Stats and Top Languages presentation while removing the runtime dependency on the paused public service. The English and Chinese profile READMEs must support light and dark GitHub themes and must never reference the public endpoint.

## Chosen Approach

Generate four static SVG files in the profile repository:

- `profile/stats-light.svg`
- `profile/stats-dark.svg`
- `profile/top-langs-light.svg`
- `profile/top-langs-dark.svg`

The existing profile update workflow will use `stats-organization/github-readme-stats-action` pinned to commit `f9d8133845f40d659a754f78b8484983ba766448` (the current `v2` target). It will generate public-account cards with the built-in `GITHUB_TOKEN`; no PAT or new secret is required.

Both READMEs will keep their current `<picture>` layout but point to repository-local SVG files. The light card will be the `<img>` fallback and the dark card will be selected by `prefers-color-scheme: dark`.

## Workflow and Data Flow

1. The existing scheduled/manual profile workflow checks out `main` and runs the PR showcase tests.
2. Four pinned Action steps generate the light and dark Stats and Top Languages SVGs under `profile/`.
3. The existing Node generator refreshes the bilingual PR tables from GitHub GraphQL.
4. A single commit step stages both README files and `profile/*.svg` only when their contents changed.
5. The workflow rebases before pushing, preserving its current conflict-avoidance behavior.

Keeping this in one profile refresh workflow avoids a third schedule, duplicate checkout logic, and competing automated commits.

## Failure Handling

- If card generation fails, the job stops before committing partial output.
- If the PR generator fails, the job also stops before committing card changes, so profile data remains an atomic update.
- Existing committed SVGs remain visible if a future scheduled run fails.
- The workflow keeps its five-minute timeout and concurrency cancellation.
- Actions remain pinned to immutable commit SHAs.

## Testing

A repository-level test will assert that:

- both READMEs reference all four local SVG paths;
- neither README references `github-readme-stats.vercel.app`;
- the workflow contains four card-generation steps using the pinned Action commit;
- the workflow stages the generated SVG files together with both READMEs.

The test will be written and observed failing before production files are changed. Existing PR showcase tests and YAML parsing will be rerun afterward. After pushing, the workflow will be dispatched manually and the live GitHub profile will be visually checked to confirm that both cards have non-zero rendered dimensions.

## Rollout

The workflow and README references will be committed first. After pushing, a manual workflow run will create and commit the initial SVG files. The live profile will then be reloaded and inspected in both the DOM and a full-page screenshot. If the initial workflow run fails, the README change will not be considered complete until the generated assets exist on `main`.
