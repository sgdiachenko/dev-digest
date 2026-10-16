"use client";

import { HoverHint } from "../HoverHint";
import { s } from "./styles";

/** One-line name with an ellipsis; the full (untrusted) text is plain text in title, label and tooltip (EC-14). */
export function TruncatedName({ name }: { name: string }) {
  return (
    <HoverHint text={name}>
      {(target) => (
        <span tabIndex={0} title={name} aria-label={name} style={s.name} {...target}>
          {name}
        </span>
      )}
    </HoverHint>
  );
}
