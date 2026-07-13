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
