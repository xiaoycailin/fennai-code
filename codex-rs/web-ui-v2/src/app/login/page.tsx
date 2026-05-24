"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DetectedAuth = {
  hasApiKey: boolean;
  hasTokens: boolean;
  baseUrl?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"oauth" | "api-key">("oauth");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/settings/auth", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const detected = data.detected as DetectedAuth | undefined;
        if (detected?.hasApiKey || detected?.hasTokens) {
          router.replace("/chat");
          return;
        }
        if (detected?.baseUrl) setBaseUrl(detected.baseUrl);
      });
  }, [router]);

  async function loginApiKey() {
    const response = await fetch("/api/settings/auth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "api-key", apiKey, baseUrl }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to save API key");
      return;
    }
    router.replace("/chat");
  }

  async function loginOauth() {
    const response = await fetch("/api/settings/auth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "oauth" }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "OAuth belum siap");
      return;
    }
    router.replace("/chat");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Sign in to FCode</h1>
        <p className="login-muted">Pilih login via ChatGPT OAuth atau API key.</p>

        <div className="login-mode-row">
          <button className={`pill ${mode === "oauth" ? "active" : ""}`} onClick={() => setMode("oauth")}>ChatGPT OAuth</button>
          <button className={`pill ${mode === "api-key" ? "active" : ""}`} onClick={() => setMode("api-key")}>API Key</button>
        </div>

        {mode === "oauth" ? (
          <div className="login-panel">
            <p className="login-muted">Kalau belum ada token OAuth, jalankan dulu di terminal:</p>
            <code>codex login</code>
            <button className="primary-button mt-3" onClick={() => void loginOauth()}>Use OAuth session</button>
          </div>
        ) : (
          <div className="login-panel">
            <label className="text-sm">API key</label>
            <input type="password" className="mt-2 w-full rounded-lg border bg-transparent p-2 text-sm" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
            <label className="mt-3 block text-sm">Base URL</label>
            <input className="mt-2 w-full rounded-lg border bg-transparent p-2 text-sm" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Contoh custom: http://localhost:20128/v1</p>
            <button className="primary-button mt-3" onClick={() => void loginApiKey()} disabled={!apiKey.trim()}>Save and continue</button>
          </div>
        )}

        {message ? <p className="login-error">{message}</p> : null}
      </section>
    </main>
  );
}
