/* useElapsedSeconds — whole seconds since `startedAt` (ms epoch), re-rendered once a second while it is set. */
"use client";

import React from "react";

export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
