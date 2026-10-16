import type { ReactNode } from "react";
import { s } from "./styles";

/** The KPI frame: an upper-case label, an optional aside (ring, chip) and the body. */
export function KpiCard({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={s.card} aria-label={label}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        {aside}
      </div>
      <div style={s.body}>{children}</div>
    </section>
  );
}
