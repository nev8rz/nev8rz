import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
