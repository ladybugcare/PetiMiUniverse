import React from 'react';

export type SegmentItem = {
  key: string;
  label: string;
  count: number;
  tone?: 'waiting' | 'active' | 'done' | 'warn' | 'neutral' | 'brand';
};

type TodayOpsSegmentBarProps = {
  segments: SegmentItem[];
  /** Quando true, mostra legenda abaixo da barra. */
  showLegend?: boolean;
};

const TONE_CLASS: Record<NonNullable<SegmentItem['tone']>, string> = {
  waiting: 'hub-today-dash__seg--waiting',
  active: 'hub-today-dash__seg--active',
  done: 'hub-today-dash__seg--done',
  warn: 'hub-today-dash__seg--warn',
  neutral: 'hub-today-dash__seg--neutral',
  brand: 'hub-today-dash__seg--brand',
};

const DEFAULT_TONES: Array<SegmentItem['tone']> = ['brand', 'active', 'waiting', 'done', 'neutral'];

export const TodayOpsSegmentBar: React.FC<TodayOpsSegmentBarProps> = ({
  segments,
  showLegend = true,
}) => {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.count), 0);
  if (total <= 0) {
    return <div className="hub-today-dash__seg hub-today-dash__seg--empty" aria-hidden />;
  }

  return (
    <div className="hub-today-dash__seg-wrap">
      <div
        className="hub-today-dash__seg"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(', ')}
      >
        {segments.map((s, i) => {
          if (s.count <= 0) return null;
          const pct = (s.count / total) * 100;
          const tone = s.tone ?? DEFAULT_TONES[i % DEFAULT_TONES.length] ?? 'neutral';
          return (
            <span
              key={s.key}
              className={`hub-today-dash__seg-part ${TONE_CLASS[tone]}`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${s.count}`}
            />
          );
        })}
      </div>
      {showLegend ? (
        <ul className="hub-today-dash__seg-legend">
          {segments
            .filter((s) => s.count > 0)
            .map((s, i) => {
              const tone = s.tone ?? DEFAULT_TONES[i % DEFAULT_TONES.length] ?? 'neutral';
              return (
                <li key={s.key}>
                  <span className={`hub-today-dash__seg-dot ${TONE_CLASS[tone]}`} aria-hidden />
                  {s.label} {s.count}
                </li>
              );
            })}
        </ul>
      ) : null}
    </div>
  );
};

type OccupancyGaugeProps = {
  label: string;
  current: number;
  max: number | null;
  overCapacity?: boolean;
};

export const TodayOccupancyGauge: React.FC<OccupancyGaugeProps> = ({
  label,
  current,
  max,
  overCapacity,
}) => {
  const pct =
    max != null && max > 0 ? Math.min(100, Math.round((current / max) * 100)) : current > 0 ? 40 : 0;
  return (
    <div
      className={`hub-today-dash__occ${overCapacity ? ' hub-today-dash__occ--over' : ''}`}
      title={max != null ? `${label}: ${current}/${max}` : `${label}: ${current}`}
    >
      <div className="hub-today-dash__occ-row">
        <span className="hub-today-dash__occ-label">{label}</span>
        <span className="hub-today-dash__occ-value">
          {current}
          {max != null ? <span className="hub-today-dash__occ-max">/{max}</span> : null}
        </span>
      </div>
      <div className="hub-today-dash__occ-track" aria-hidden>
        <span className="hub-today-dash__occ-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
