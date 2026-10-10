/* ScoreRing — circular progress ring with the score in the middle. The ring is
   decorative; the score is exposed through the accessible label. */
import { scoreFraction } from "../../helpers";

const SIZE = 44;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ score, color, label }: { score: number | null; color: string; label: string }) {
  const offset = CIRCUMFERENCE * (1 - scoreFraction(score));
  return (
    <div
      role="img"
      aria-label={label}
      style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle
          data-testid="score-ring-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {score == null ? "–" : Math.round(score)}
      </span>
    </div>
  );
}
