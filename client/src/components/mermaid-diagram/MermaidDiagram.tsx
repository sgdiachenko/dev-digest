"use client";

import React from "react";

let seq = 0;

/** Mermaid diagrams must start with a known graph keyword. Anything else
 *  (prose, JSON like {"type":"Buffer"...}, empty) is not a diagram → skip. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

function looksLikeMermaid(src: string): boolean {
  return MERMAID_RE.test(src.trim());
}

function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Per-diagram theme for `bare` diagrams, as a mermaid `%%{init}%%` directive: dark/light follows the
 * app's CSS tokens, and it applies to this diagram only (`mermaid.initialize` is global, so changing it
 * would restyle every other diagram). Prepended after validation, so it is never model-controlled text.
 */
function themeDirective(): string {
  const config = {
    theme: "base",
    themeVariables: {
      background: "transparent",
      fontFamily: cssVar("--font-mono", "ui-monospace, SFMono-Regular, Menlo, monospace"),
      fontSize: "18px",
      primaryColor: cssVar("--bg-elevated", "#1c1c1c"),
      primaryBorderColor: cssVar("--accent", "#3b82f6"),
      primaryTextColor: cssVar("--text-primary", "#ededed"),
      lineColor: cssVar("--text-muted", "#6a6a6a"),
      clusterBkg: cssVar("--bg-surface", "#141414"),
      clusterBorder: cssVar("--border", "#2a2a2a"),
      edgeLabelBackground: cssVar("--bg-surface", "#141414"),
    },
    flowchart: { curve: "basis", nodeSpacing: 40, rankSpacing: 56, padding: 14 },
  };
  return `%%{init: ${JSON.stringify(config)}}%%\n`;
}

/** Never shrink a diagram below this: smaller and the labels stop being readable. */
const MIN_BARE_SCALE = 0.6;

/** Rounded nodes. Run once, right after the svg is injected. */
function roundNodes(svg: SVGSVGElement): void {
  svg.querySelectorAll(".node rect").forEach((rect) => {
    rect.setAttribute("rx", "8");
    rect.setAttribute("ry", "8");
  });
}

/** Fit the diagram to the box width, but not below MIN_BARE_SCALE (the box scrolls beyond that), instead
 *  of mermaid's shrink-to-fit, which makes a wide diagram unreadably small. */
function fitBareSvg(svg: SVGSVGElement, available: number): void {
  const natural = svg.viewBox?.baseVal?.width ?? 0;
  svg.style.maxWidth = "none";
  svg.style.height = "auto";
  svg.style.flexShrink = "0";
  svg.style.margin = "0 auto";
  if (natural <= 0) return;
  const scale = available > 0 ? Math.min(1, Math.max(MIN_BARE_SCALE, available / natural)) : 1;
  svg.style.width = `${Math.round(natural * scale)}px`;
}

/**
 * Renders a mermaid diagram string to inline SVG. mermaid is imported lazily
 * (client-only). We VALIDATE with mermaid.parse({suppressErrors}) before
 * rendering — mermaid otherwise injects a "Syntax error" bomb graphic into the
 * DOM on bad input instead of throwing. Junk/unparseable input renders nothing.
 */
export function MermaidDiagram({
  chart,
  onInvalid,
  bare = false,
}: {
  chart: string;
  /** Called when the chart turns out not to be a renderable diagram, so the
   *  caller can show its own fallback. */
  onInvalid?: () => void;
  /** Drops the built-in box (background, border, padding) for callers that frame the diagram themselves. */
  bare?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"pending" | "ok" | "invalid">("pending");
  const onInvalidRef = React.useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  React.useEffect(() => {
    if (state === "invalid") onInvalidRef.current?.();
  }, [state]);

  React.useEffect(() => {
    let cancelled = false;
    const src = (chart ?? "").trim();
    if (!looksLikeMermaid(src)) {
      setState("invalid");
      return;
    }
    setState("pending");
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        // `bare` diagrams carry their own theme; the directive goes in after the keyword check above.
        const full = bare ? themeDirective() + src : src;
        // parse first; suppressErrors → returns false (no throw, no DOM bomb).
        const valid = await mermaid.parse(full, { suppressErrors: true });
        if (cancelled) return;
        if (!valid) {
          setState("invalid");
          return;
        }
        const { svg } = await mermaid.render(`dd-mermaid-${seq++}`, full);
        if (cancelled) return;
        if (ref.current) {
          ref.current.innerHTML = svg;
          const el = ref.current.querySelector("svg");
          if (bare && el) roundNodes(el);
        }
        setState("ok");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, bare]);

  // bare: size the svg once it is visible (a display:none box has no width) and again when the box resizes.
  React.useLayoutEffect(() => {
    const host = ref.current;
    if (!bare || state !== "ok" || !host) return;
    const fit = () => {
      const svg = host.querySelector("svg");
      if (svg) fitBareSvg(svg, host.clientWidth);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [bare, state]);

  // Not a (valid) diagram → render nothing rather than a broken box.
  if (state === "invalid") return null;

  return (
    <div
      ref={ref}
      style={{
        display: state === "ok" ? "flex" : "none",
        // bare: the svg centres itself with auto margins; centring the flex line would clip the
        // left edge of a diagram wider than the box, where scrolling cannot reach it.
        justifyContent: bare ? "flex-start" : "center",
        ...(bare
          ? {}
          : {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
            }),
        overflowX: "auto",
      }}
    />
  );
}

export default MermaidDiagram;
