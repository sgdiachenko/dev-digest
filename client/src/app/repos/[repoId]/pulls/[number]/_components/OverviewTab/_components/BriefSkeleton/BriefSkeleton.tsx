/* BriefSkeleton — placeholder while the brief loads or is being generated. */
"use client";

import React from "react";
import { Skeleton } from "@devdigest/ui";

export function BriefSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div data-testid="brief-skeleton" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
