import type { ReactNode } from "react";
import { s } from "./styles";

/** KPI frame with the label in catalog case — no text-transform, so rendered text equals the catalog (C26). */
export function SkillKpiCard({ label, aside, children }: { label: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={s.card}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        {aside}
      </div>
      <div style={s.body}>{children}</div>
    </section>
  );
}
