/** Ring geometry in the 16-unit viewBox: radius leaves room for the stroke. */
const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ProgressRingProps {
  readonly done: number;
  readonly total: number;
  readonly size?: number;
}

/** A compact circular progress indicator, used where a bar would not fit. */
export function ProgressRing({ done, total, size = 16 }: ProgressRingProps) {
  const ratio = total === 0 ? 0 : done / total;
  const complete = total > 0 && done === total;

  return (
    <svg
      className={`pd-ring${complete ? ' pd-ring--complete' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={total === 0 ? 'No tasks' : `${done} of ${total} done`}
    >
      <circle className="pd-ring__track" cx="8" cy="8" r={RADIUS} />
      <circle
        className="pd-ring__fill"
        cx="8"
        cy="8"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
