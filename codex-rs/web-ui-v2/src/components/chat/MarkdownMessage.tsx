"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cleanDisplayText } from "@/lib/text";

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          if (url.startsWith("data:image/")) return url;
          return url;
        }}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("fcode-mention://")) {
              return <span className="markdown-mention">{cleanMentionChildren(children)}</span>;
            }
            return <a href={href}>{children}</a>;
          },
          img: ({ src, alt }) => (
            <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} />
          ),
        }}
      >
        {normalizeMarkdownText(cleanDisplayText(text))}
      </ReactMarkdown>
    </div>
  );
}

function cleanMentionChildren(children: React.ReactNode) {
  if (typeof children === "string") return children.replace(/^[/@]/, "");
  if (Array.isArray(children) && typeof children[0] === "string") {
    return [children[0].replace(/^[/@]/, ""), ...children.slice(1)];
  }
  return children;
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState(src ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const generated = Boolean(src?.startsWith("/api/workspace/blob"));

  useEffect(() => {
    if (!src?.startsWith("data:image/")) {
      setResolvedSrc(src ?? "");
      return;
    }
    const blob = dataUrlToBlob(src);
    const objectUrl = URL.createObjectURL(blob);
    setResolvedSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [src]);

  return (
    <>
      <span className={generated ? "generated-image-card" : ""}>
        <button className="markdown-image-button" type="button" onClick={() => setPreviewOpen(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolvedSrc} alt={alt ?? "image"} className={generated ? "markdown-image generated" : "markdown-image"} loading="lazy" />
        </button>
        {generated && resolvedSrc ? (
          <a className="generated-image-download" href={resolvedSrc} download={alt ?? "FCode Image.png"} aria-label="Download image">
            ↧
          </a>
        ) : null}
      </span>
      {previewOpen ? (
        <div className="image-preview-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button image-preview-close" onClick={() => setPreviewOpen(false)}>×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvedSrc} alt={alt ?? "image"} className="image-preview-image" />
            <p className="image-preview-caption">{alt ?? "image"}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, encoded] = dataUrl.split(",", 2);
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "application/octet-stream";
  const binary = atob(encoded ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function normalizeMarkdownText(value: string) {
  let normalized = value;
  if (normalized.includes("fcode-mention://")) {
    normalized = normalized.replace(/\[([^\]]+)\]\(fcode-mention:\/\/([^/]+)\/([^)]+)\)/g, (_all, label, kind, rawValue) => {
      const encoded = String(rawValue).replace(/[()]/g, (char: string) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      return `[${label}](fcode-mention://${kind}/${encoded})`;
    });
  }
  if (!normalized.includes("![") || !normalized.includes("Attachments:")) return normalized;
  return normalized
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "Attachments:" && !/^[\w\s().-]+\s+\(image\)$/.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
