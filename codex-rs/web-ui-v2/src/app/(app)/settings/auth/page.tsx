"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { SettingsSelect } from "@/components/settings/SettingsSelect";

type DetectedAuth = {
  sourcePath: string;
  exists: boolean;
  mode: "api-key" | "oauth" | null;
  modeRaw: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  hasTokens: boolean;
  accountId: string | null;
  lastRefresh: string | null;
  baseUrl?: string;
  error?: string;
};

export default function SettingsAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState("api-key");
  const [keyName, setKeyName] = useState("");
  const [keys, setKeys] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
  const [detected, setDetected] = useState<DetectedAuth | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await fetch("/api/settings/auth").then((response) => response.json());
    setMode(data.mode ?? "api-key");
    setKeys(data.apiKeys ?? []);
    setDetected(data.detected ?? null);
  }

  useEffect(() => { void load(); }, []);

  async function patch(body: Record<string, string>) {
    const response = await fetch("/api/settings/auth", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Auth action failed");
      return;
    }
    setMode(data.mode ?? "api-key");
    setKeys(data.apiKeys ?? []);
    await load();
  }

  async function logout() {
    await patch({ action: "logout" });
    router.replace("/login");
  }

  return (
    <SettingsLayout title="Auth">
      <div className="panel-card mb-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Detected FCode auth</p>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{detected?.sourcePath ?? "~/.fcode/auth.json"}</p>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {detected?.mode === "api-key" ? "API Key" : detected?.mode === "oauth" ? "OAuth" : "Unknown"}
          </span>
        </div>
        {!detected?.exists ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>File auth belum ada.</p>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span style={{ color: "var(--muted)" }}>Auth mode:</span> {detected?.modeRaw ?? "-"}</div>
            <div><span style={{ color: "var(--muted)" }}>API key:</span> {detected?.hasApiKey ? detected.apiKeyMasked : "Not found"}</div>
            <div><span style={{ color: "var(--muted)" }}>Tokens:</span> {detected?.hasTokens ? "Available" : "Not found"}</div>
            <div><span style={{ color: "var(--muted)" }}>Account:</span> {detected?.accountId ?? "-"}</div>
            <div><span style={{ color: "var(--muted)" }}>Base URL:</span> {detected?.baseUrl ?? "https://api.openai.com/v1"}</div>
            <div className="sm:col-span-2"><span style={{ color: "var(--muted)" }}>Last refresh:</span> {detected?.lastRefresh ?? "-"}</div>
            {detected?.error ? <div className="sm:col-span-2 text-sm text-red-400">{detected.error}</div> : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="danger-button" onClick={() => void logout()}>Logout</button>
          <button className="ghost-button" onClick={() => router.push("/login")}>Switch login</button>
        </div>
        {message ? <p className="text-sm text-red-400">{message}</p> : null}
      </div>
      <label className="config-field">
        <span>Auth mode</span>
        <SettingsSelect
          value={mode}
          items={[
            { value: "api-key", label: "API Key" },
            { value: "oauth", label: "OAuth" },
          ]}
          onChange={(value) => void patch({ mode: value })}
        />
      </label>
      {mode === "api-key" ? (
        <div className="mt-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <input className="config-input" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Key name" />
            <button className="primary-button" onClick={async () => { if (keyName.trim()) await patch({ addKeyName: keyName }); setKeyName(""); }}>Add key</button>
          </div>
          <div className="mt-4 space-y-2">{keys.map((key) => <div key={key.id} className="panel-card">{key.name} · {(key as { masked?: string }).masked ?? `****${key.id.slice(-4)}`}</div>)}</div>
        </div>
      ) : <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>OAuth providers are not connected yet. GitHub/Google config needed.</p>}
    </SettingsLayout>
  );
}
