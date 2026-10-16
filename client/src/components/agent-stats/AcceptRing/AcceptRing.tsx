"use client";

import { acceptLevel, wholePercent } from "../../../lib/agent-stats/accept";
import { LEVEL_COLOR, s } from "./styles";

/** Accept-rate ring: colour by the accept scale, grey for a small sample; the percent is text (NFR-12). */
export function AcceptRing({
  rate,
  smallSample,
  size = 44,
  stroke = 4,
}: {
  rate: number | null;
  smallSample: boolean;
  size?: number;
  stroke?: number;
}) {
  const pct = wholePercent(rate);
  const color = LEVEL_COLOR[acceptLevel(rate, smallSample)];
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <span style={{ ...s.wrap, width: size, height: size }}>
      <svg width={size} height={size} style={s.svg} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={stroke} />
        {pct != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="tnum" style={{ ...s.label, fontSize: size * 0.3, color }}>
        {pct ?? "—"}
      </span>
    </span>
  );
}
