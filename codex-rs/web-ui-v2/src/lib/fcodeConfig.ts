import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FcodeProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  wireApi: string;
};

export type FcodeConfigView = {
  path: string;
  exists: boolean;
  raw: string;
  modelProvider: string;
  model: string;
  personality: string;
  reasoningEffort: string;
  instructions: string;
  memories: boolean;
  provider: FcodeProviderConfig;
  subagentModel: string;
};

export type FcodeConfigPatch = Omit<FcodeConfigView, "path" | "exists" | "raw" | "provider"> & {
  provider: FcodeProviderConfig;
};

export type ConfigEdit = {
  keyPath: string;
  value: string | boolean | number | null;
  mergeStrategy: "replace" | "upsert";
};

export type FcodeWorkspaceProject = {
  path: string;
  trustLevel: string;
};

const DEFAULT_PROVIDER: FcodeProviderConfig = {
  id: "9router",
  name: "9Router",
  baseUrl: "http://127.0.0.1:20128/v1",
  wireApi: "responses",
};

export function fcodeConfigPath() {
  return path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), ".fcode", "config.toml");
}

export function readFcodeConfig(): FcodeConfigView {
  const configPath = fcodeConfigPath();
  const exists = fs.existsSync(configPath);
  const raw = exists ? fs.readFileSync(configPath, "utf8") : "";
  const modelProvider = readTomlValue(raw, [], "model_provider") ?? DEFAULT_PROVIDER.id;
  const provider = readProvider(raw, modelProvider);

  return {
    path: configPath,
    exists,
    raw,
    modelProvider,
    model: readTomlValue(raw, [], "model") ?? "gpt-5.5",
    personality: readTomlValue(raw, [], "personality") ?? "pragmatic",
    reasoningEffort: readTomlValue(raw, [], "model_reasoning_effort") ?? "medium",
    instructions: readTomlValue(raw, [], "instructions") ?? "",
    memories: readTomlBoolean(raw, ["features"], "memories") ?? true,
    provider,
    subagentModel: readTomlValue(raw, ["agents", "subagent"], "model") ?? "",
  };
}

export function writeFcodeConfig(input: FcodeConfigPatch) {
  const configPath = fcodeConfigPath();
  let raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const providerId = input.provider.id.trim() || input.modelProvider.trim() || DEFAULT_PROVIDER.id;

  raw = setTomlValue(raw, [], "model_provider", providerId);
  raw = setTomlValue(raw, [], "model", input.model.trim());
  raw = setTomlValue(raw, [], "personality", input.personality.trim());
  raw = setTomlValue(raw, [], "model_reasoning_effort", input.reasoningEffort.trim());
  raw = setTomlValue(raw, [], "instructions", input.instructions);
  raw = setTomlValue(raw, ["features"], "memories", input.memories);
  raw = setTomlValue(raw, ["model_providers", providerId], "name", input.provider.name.trim());
  raw = setTomlValue(raw, ["model_providers", providerId], "base_url", input.provider.baseUrl.trim());
  raw = setTomlValue(raw, ["model_providers", providerId], "wire_api", input.provider.wireApi.trim());
  if (input.subagentModel.trim()) {
    raw = setTomlValue(raw, ["agents", "subagent"], "model", input.subagentModel.trim());
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
  return readFcodeConfig();
}

export function writeRawFcodeConfig(raw: string) {
  const configPath = fcodeConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
  return readFcodeConfig();
}

export function toConfigEdits(input: FcodeConfigPatch): ConfigEdit[] {
  const providerId = input.provider.id.trim() || input.modelProvider.trim() || DEFAULT_PROVIDER.id;
  return [
    edit("model_provider", providerId),
    edit("model", input.model.trim()),
    edit("personality", input.personality.trim()),
    edit("model_reasoning_effort", input.reasoningEffort.trim()),
    edit("instructions", input.instructions),
    edit("features.memories", input.memories),
    edit(`model_providers.${providerId}.name`, input.provider.name.trim()),
    edit(`model_providers.${providerId}.base_url`, input.provider.baseUrl.trim()),
    edit(`model_providers.${providerId}.wire_api`, input.provider.wireApi.trim()),
    edit("agents.subagent.model", input.subagentModel.trim()),
  ];
}

export function listFcodeWorkspaceProjects(): FcodeWorkspaceProject[] {
  const configPath = fcodeConfigPath();
  if (!fs.existsSync(configPath)) return [];
  const raw = fs.readFileSync(configPath, "utf8");
  const projects: FcodeWorkspaceProject[] = [];
  const projectRegex = /^\[projects\.(?:'([^']+)'|"([^"]+)")\]\s*$(?:\r?\n)+trust_level\s*=\s*"([^"]+)"/gm;
  for (const match of raw.matchAll(projectRegex)) {
    const projectPath = (match[1] || match[2] || "").trim();
    const trustLevel = (match[3] || "trusted").trim();
    if (projectPath) projects.push({ path: projectPath, trustLevel });
  }
  return dedupeProjects(projects);
}

export function addFcodeWorkspaceProject(projectPath: string, trustLevel = "trusted") {
  const normalizedPath = normalizeWorkspacePath(projectPath);
  if (!normalizedPath) return listFcodeWorkspaceProjects();
  const configPath = fcodeConfigPath();
  const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const existing = listFcodeWorkspaceProjects();
  if (existing.some((project) => sameWorkspacePath(project.path, normalizedPath))) return existing;
  const block = [`[projects.'${normalizedPath.replace(/'/g, "\\'")}']`, `trust_level = "${trustLevel}"`, ""].join("\n");
  const nextRaw = raw.trimEnd() ? `${raw.trimEnd()}\n\n${block}\n` : `${block}\n`;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, nextRaw, "utf8");
  return listFcodeWorkspaceProjects();
}

export function removeFcodeWorkspaceProject(projectPath: string) {
  const normalizedPath = normalizeWorkspacePath(projectPath);
  const configPath = fcodeConfigPath();
  if (!normalizedPath || !fs.existsSync(configPath)) return listFcodeWorkspaceProjects();
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const kept: string[] = [];
  let skip = false;
  for (const line of lines) {
    const match = line.trim().match(/^\[projects\.(?:'([^']+)'|"([^"]+)")\]$/);
    if (match) {
      const currentPath = normalizeWorkspacePath(match[1] || match[2] || "");
      skip = sameWorkspacePath(currentPath, normalizedPath);
      if (skip) continue;
    }
    if (skip) {
      if (/^\[.+\]$/.test(line.trim())) {
        skip = false;
        kept.push(line);
      }
      continue;
    }
    kept.push(line);
  }
  fs.writeFileSync(configPath, `${kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`, "utf8");
  return listFcodeWorkspaceProjects();
}

function edit(keyPath: string, value: string | boolean): ConfigEdit {
  return { keyPath, value, mergeStrategy: "upsert" };
}

function normalizeWorkspacePath(value: string) {
  return value.trim().replace(/\//g, "\\").replace(/\\+$/, "");
}

function sameWorkspacePath(left: string, right: string) {
  return normalizeWorkspacePath(left).toLowerCase() === normalizeWorkspacePath(right).toLowerCase();
}

function dedupeProjects(projects: FcodeWorkspaceProject[]) {
  const seen = new Set<string>();
  const output: FcodeWorkspaceProject[] = [];
  for (const project of projects) {
    const key = normalizeWorkspacePath(project.path).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({ ...project, path: normalizeWorkspacePath(project.path) });
  }
  return output;
}

function readProvider(raw: string, providerId: string): FcodeProviderConfig {
  const section = ["model_providers", providerId || DEFAULT_PROVIDER.id];
  return {
    id: providerId || DEFAULT_PROVIDER.id,
    name: readTomlValue(raw, section, "name") ?? DEFAULT_PROVIDER.name,
    baseUrl: readTomlValue(raw, section, "base_url") ?? DEFAULT_PROVIDER.baseUrl,
    wireApi: readTomlValue(raw, section, "wire_api") ?? DEFAULT_PROVIDER.wireApi,
  };
}

function readTomlValue(raw: string, section: string[], key: string) {
  const lines = raw.split(/\r?\n/);
  let current: string[] = [];
  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].split(".");
      continue;
    }
    if (!sameSection(current, section)) continue;
    const match = line.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(.+?)\\s*$`));
    if (!match) continue;
    return parseTomlScalar(match[1]);
  }
  return null;
}

function readTomlBoolean(raw: string, section: string[], key: string) {
  const value = readTomlValue(raw, section, key);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseTomlScalar(value: string) {
  const trimmed = value.replace(/\s+#.*$/, "").trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function setTomlValue(raw: string, section: string[], key: string, value: string | boolean) {
  const lines = raw ? raw.split(/\r?\n/) : [];
  const rendered = `${key} = ${formatTomlValue(value)}`;
  const bounds = findSectionBounds(lines, section);

  if (!bounds) {
    const prefix = lines.length && lines.at(-1)?.trim() ? [""] : [];
    return [...lines, ...prefix, section.length ? `[${section.join(".")}]` : "", rendered].filter(Boolean).join("\n");
  }

  for (let index = bounds.start; index < bounds.end; index += 1) {
    if (new RegExp(`^\\s*${escapeRegex(key)}\\s*=`).test(lines[index])) {
      lines[index] = rendered;
      return lines.join("\n");
    }
  }

  lines.splice(bounds.end, 0, rendered);
  return lines.join("\n");
}

function findSectionBounds(lines: string[], section: string[]) {
  if (!section.length) {
    const nextSection = lines.findIndex((line) => /^\s*\[.+\]\s*$/.test(line));
    return { start: 0, end: nextSection === -1 ? lines.length : nextSection };
  }

  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(/^\[([^\]]+)\]$/);
    if (!match) continue;
    if (sameSection(match[1].split("."), section)) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return null;

  const nextRelative = lines.slice(start).findIndex((line) => /^\s*\[.+\]\s*$/.test(line));
  return { start, end: nextRelative === -1 ? lines.length : start + nextRelative };
}

function formatTomlValue(value: string | boolean) {
  return typeof value === "boolean" ? String(value) : JSON.stringify(value);
}

function sameSection(left: string[], right: string[]) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
