import { NextResponse } from "next/server";
import { z } from "zod";
import { addApiKey, deleteApiKey, readAuthSettings, writeAuthSettings } from "@/lib/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const schema = z.object({
  mode: z.enum(["api-key", "oauth"]).optional(),
  addKeyName: z.string().optional(),
  deleteKeyId: z.string().optional(),
  action: z.enum(["logout", "api-key", "oauth"]).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

type FcodeAuthFile = {
  auth_mode?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  openai_base_url?: string;
  base_url?: string;
  tokens?: { account_id?: string };
  last_refresh?: string;
};

function authPath() {
  return path.join(os.homedir(), ".fcode", "auth.json");
}

function maskApiKey(value: string) {
  if (value.length <= 10) return `${value.slice(0, 3)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function readDetectedAuth() {
  const filePath = authPath();
  if (!fs.existsSync(filePath)) {
    return {
      sourcePath: filePath,
      exists: false,
      mode: null,
      modeRaw: null,
      hasApiKey: false,
      apiKeyMasked: null,
      hasTokens: false,
      accountId: null,
      lastRefresh: null,
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as FcodeAuthFile;
    const modeRaw = (raw.auth_mode ?? "").toLowerCase();
    const hasApiKey = Boolean(raw.OPENAI_API_KEY?.trim());
    const hasTokens = Boolean(raw.tokens?.account_id);
    const mode = modeRaw === "apikey" || modeRaw === "api-key" || hasApiKey ? "api-key" : hasTokens ? "oauth" : null;
    const baseUrl = raw.OPENAI_BASE_URL || raw.openai_base_url || raw.base_url || "https://api.openai.com/v1";
    return {
      sourcePath: filePath,
      exists: true,
      mode,
      modeRaw: modeRaw || null,
      hasApiKey,
      apiKeyMasked: hasApiKey ? maskApiKey(raw.OPENAI_API_KEY as string) : null,
      hasTokens,
      accountId: raw.tokens?.account_id ?? null,
      lastRefresh: raw.last_refresh ?? null,
      baseUrl,
    };
  } catch {
    return {
      sourcePath: filePath,
      exists: true,
      mode: null,
      modeRaw: null,
      hasApiKey: false,
      apiKeyMasked: null,
      hasTokens: false,
      accountId: null,
      lastRefresh: null,
      error: "Failed to parse auth.json",
    };
  }
}

function writeApiKeyAuth(apiKey: string, baseUrl?: string) {
  const cleanKey = apiKey.trim();
  if (!cleanKey) throw new Error("API key kosong");
  const cleanBaseUrl = (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const filePath = authPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    auth_mode: "apikey",
    OPENAI_API_KEY: cleanKey,
    OPENAI_BASE_URL: cleanBaseUrl,
    last_refresh: new Date().toISOString(),
  }, null, 2));
}

function logoutAuth() {
  const filePath = authPath();
  if (!fs.existsSync(filePath)) return;
  const backup = path.join(path.dirname(filePath), `auth.logged-out.${Date.now()}.json`);
  fs.renameSync(filePath, backup);
}

function switchToOauthIfAvailable() {
  const filePath = authPath();
  if (!fs.existsSync(filePath)) return false;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as FcodeAuthFile;
  if (!raw.tokens?.account_id) return false;
  delete raw.OPENAI_API_KEY;
  raw.auth_mode = "chatgpt";
  raw.last_refresh = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
  return true;
}

export async function GET() {
  return NextResponse.json({
    ...readAuthSettings(),
    detected: readDetectedAuth(),
  });
}

export async function PATCH(request: Request) {
  const body = schema.parse(await request.json());
  if (body.action === "logout") {
    logoutAuth();
    return NextResponse.json({
      ...writeAuthSettings({ mode: "api-key" }),
      detected: readDetectedAuth(),
    });
  }
  if (body.action === "api-key") {
    try {
      writeApiKeyAuth(body.apiKey ?? "", body.baseUrl);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save API key" }, { status: 400 });
    }
    return NextResponse.json({
      ...writeAuthSettings({ mode: "api-key" }),
      detected: readDetectedAuth(),
    });
  }
  if (body.action === "oauth") {
    if (!switchToOauthIfAvailable()) {
      return NextResponse.json({
        error: "ChatGPT OAuth belum tersedia di auth.json. Jalankan `codex login` dulu, lalu klik OAuth lagi.",
        command: "codex login",
      }, { status: 409 });
    }
    return NextResponse.json({
      ...writeAuthSettings({ mode: "oauth" }),
      detected: readDetectedAuth(),
    });
  }
  if (body.addKeyName) addApiKey(body.addKeyName);
  if (body.deleteKeyId) deleteApiKey(body.deleteKeyId);
  return NextResponse.json(writeAuthSettings({ mode: body.mode }));
}
