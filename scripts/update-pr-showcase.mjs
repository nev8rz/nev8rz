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
