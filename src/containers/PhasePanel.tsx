import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useMemo, useState, type ReactElement } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { PhaseDurations } from '@/charts/PhaseDurations';
import type { SurgeryCase } from '@/data/schema';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { PHASES, phaseByOperationType, type PhaseKey } from '@/transforms/phases';

interface PhasePanelProps {
  matchedCases: readonly SurgeryCase[];
}

const ROW_HEIGHT = 28;
const CHART_CHROME = 52;

export function PhasePanel({ matchedCases }: PhasePanelProps): ReactElement {
  // Local state: choosing which phase to look at does not change the cohort,
  // so it is not part of the shareable filter URL.
  const [phaseKey, setPhaseKey] = useState<PhaseKey>('preIncision');
  const [containerRef, { width }] = useResizeObserver();

  const phase = PHASES.find((p) => p.key === phaseKey) ?? PHASES[0];

  const rows = useMemo(
    () => (phase === undefined ? [] : phaseByOperationType(matchedCases, phase)),
    [matchedCases, phase],
  );

  const description = useMemo(() => {
    const all = rows[0]?.summary;
    if (all == null) return 'No cases in this cohort have both timestamps recorded.';

    return `${all.count.toLocaleString()} timed cases. Median ${all.median.toFixed(0)} minutes, with the middle half between ${all.q1.toFixed(0)} and ${all.q3.toFixed(0)}.`;
  }, [rows]);

  const hasData = rows.some((r) => r.summary !== null);

  return (
    <ChartCard
      title="Procedure phases"
      subtitle="Median and interquartile range by procedure type"
      action={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={phaseKey}
          onChange={(_event, next: PhaseKey | null) => {
            // null arrives when the active button is clicked again; keeping the
            // current phase avoids an empty chart with no way back.
            if (next !== null) setPhaseKey(next);
          }}
          aria-label="Phase"
        >
          {PHASES.map((p) => (
            <ToggleButton key={p.key} value={p.key} sx={{ fontSize: '0.7rem', py: 0.25 }}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      <div ref={containerRef} style={{ width: '100%' }}>
        {!hasData ? (
          <EmptyState
            title="No timed cases"
            description="No case in this cohort has both timestamps for this phase."
            height={240}
          />
        ) : (
          width > 0 &&
          phase !== undefined && (
            <PhaseDurations
              rows={rows}
              width={width}
              height={rows.length * ROW_HEIGHT + CHART_CHROME}
              phaseLabel={phase.label}
              description={description}
            />
          )
        )}
      </div>
    </ChartCard>
  );
}
