"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { fileUrl } from "../../helpers";

const REPO_SCHEME = "repo:";

/** Lets `repo:` through; everything else goes through react-markdown's default (drops javascript:/data:). */
function urlTransform(url: string): string {
  return url.startsWith(REPO_SCHEME) ? url : defaultUrlTransform(url);
}

/** The server percent-encodes ( ) whitespace < > in `repo:` paths; null on a malformed escape. */
function decodePath(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Renders model narrative Markdown. No rehype-raw: raw HTML shows as text.
 * Only `repo:<path>` links become GitHub links pinned to `sha`; any other href is plain text.
 */
export function NarrativeMarkdown({
  children,
  repoFullName,
  sha,
}: {
  children: string;
  repoFullName: string;
  sha: string;
}) {
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          a: ({ children: label, href }) => {
            if (!href?.startsWith(REPO_SCHEME)) return <>{label}</>;
            const path = decodePath(href.slice(REPO_SCHEME.length));
            if (path === null) return <>{label}</>;
            const kind = path.endsWith("/") ? "directory" : "file";
            return (
              <a
                href={fileUrl(repoFullName, sha, path.replace(/\/+$/, ""), kind)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-text)", textDecoration: "underline" }}
              >
                {label}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
