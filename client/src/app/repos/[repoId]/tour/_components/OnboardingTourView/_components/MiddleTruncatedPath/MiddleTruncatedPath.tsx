import type { CSSProperties } from "react";
import { splitForMiddleTruncation } from "../../helpers";

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

/** A repo path ellipsized in the middle (head shrinks, file name stays). Full path = tooltip + accessible text. */
export function MiddleTruncatedPath({ path }: { path: string }) {
  const { head, tail } = splitForMiddleTruncation(path);
  return (
    <span
      title={path}
      style={{ display: "inline-flex", minWidth: 0, maxWidth: "100%", fontFamily: "var(--font-mono, monospace)" }}
    >
      <span aria-hidden="true" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {head}
      </span>
      {tail && (
        <span aria-hidden="true" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          {tail}
        </span>
      )}
      <span style={srOnly}>{path}</span>
    </span>
  );
}
