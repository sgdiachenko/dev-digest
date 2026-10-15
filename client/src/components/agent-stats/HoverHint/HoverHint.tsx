"use client";

import React from "react";
import { s } from "./styles";

export interface HoverHintTarget {
  "aria-describedby"?: string;
}

/**
 * A tooltip that opens on hover AND keyboard focus of whatever `children` renders, and
 * closes on blur, mouse-leave and Escape. `children` receives the `aria-describedby` to spread.
 */
export function HoverHint({
  text,
  children,
}: {
  text: React.ReactNode;
  children: (target: HoverHintTarget) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <span
      style={s.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children({ "aria-describedby": open ? id : undefined })}
      {open && (
        <span role="tooltip" id={id} style={s.tooltip}>
          {text}
        </span>
      )}
    </span>
  );
}
