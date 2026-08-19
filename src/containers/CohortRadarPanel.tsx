import { Box, Chip, FormControlLabel, Slider, Stack, Switch, Typography } from '@mui/material';
import { useMemo, useState, type ReactElement } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { RiskRadar } from '@/charts/RiskRadar';
import type { SurgeryCase } from '@/data/schema';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import {
  DEFAULT_TOLERANCES,
  MATCH_CRITERIA,
  MINIMUM_COHORT,
  isCohortPlottable,
  matchCohort,
  summariseCohort,
  type MatchCriterion,
  type PatientProfile,
} from '@/transforms/cohort';

interface CohortRadarPanelProps {
  /** Matched against the whole table, not the dashboard's filtered cohort. */
  allCases: readonly SurgeryCase[];
}

const CHART_HEIGHT = 320;

const SLIDERS: {
  key: keyof PatientProfile;
  criterion: MatchCriterion;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}[] = [
  {
    key: 'age',
    criterion: 'age',
    label: 'Age',
    min: 0,
    max: 94,
    step: 1,
    format: (v) => `${String(v)} yrs`,
  },
  {
    key: 'bmi',
    criterion: 'bmi',
    label: 'BMI',
    min: 12,
    max: 45,
    step: 0.5,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'heightCm',
    criterion: 'height',
    label: 'Height',
    min: 130,
    max: 200,
    step: 1,
    format: (v) => `${String(v)} cm`,
  },
  {
    key: 'asa',
    criterion: 'asa',
    label: 'ASA',
    min: 1,
    max: 5,
    step: 1,
    format: (v) => `class ${String(v)}`,
  },
];

export function CohortRadarPanel({ allCases }: CohortRadarPanelProps): ReactElement {
  // Local state. These sliders describe a hypothetical patient rather than
  // narrowing the dashboard's cohort, so they are not part of the shareable
  // filter URL — and this panel deliberately matches against the whole table,
  // because compounding it with the dashboard filters would shrink cohorts
  // below anything estimable within two clicks.
  const [profile, setProfile] = useState<PatientProfile>({
    age: 60,
    bmi: 25,
    heightCm: 170,
    asa: 2,
  });
  const [active, setActive] = useState<ReadonlySet<MatchCriterion>>(new Set(MATCH_CRITERIA));

  const [containerRef, { width }] = useResizeObserver<HTMLDivElement>();

  const summary = useMemo(
    () => summariseCohort(matchCohort(allCases, profile, active), allCases),
    [allCases, profile, active],
  );

  const plottable = isCohortPlottable(summary);

  const description = useMemo(() => {
    if (!plottable) {
      return `Only ${String(summary.size)} cases match this profile — fewer than the ${String(MINIMUM_COHORT)} needed to estimate an outcome rate.`;
    }
    const parts = summary.axes
      .filter((a) => a.estimate !== null)
      .map((a) => `${a.label} ${((a.estimate?.estimate ?? 0) * 100).toFixed(1)}%`);
    return `${summary.size.toLocaleString()} similar cases. ${parts.join(', ')}.`;
  }, [summary, plottable]);

  function toggleCriterion(criterion: MatchCriterion): void {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(criterion)) next.delete(criterion);
      else next.add(criterion);
      return next;
    });
  }

  return (
    <ChartCard
      title="Risk profile builder"
      subtitle="Outcomes for cases resembling this patient, against the dataset average. Matches the full table, not the dashboard filters."
    >
      <Stack spacing={1.5} sx={{ mb: 1 }}>
        {SLIDERS.map((slider) => {
          const enabled = active.has(slider.criterion);
          return (
            <Box key={slider.key} sx={{ opacity: enabled ? 1 : 0.45 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <FormControlLabel
                  sx={{ minWidth: 132, mr: 0 }}
                  control={
                    <Switch
                      size="small"
                      checked={enabled}
                      onChange={() => {
                        toggleCriterion(slider.criterion);
                      }}
                      slotProps={{
                        input: { 'aria-label': `Match on ${slider.label.toLowerCase()}` },
                      }}
                    />
                  }
                  label={
                    <Typography variant="caption">
                      {slider.label} · {slider.format(profile[slider.key])}
                    </Typography>
                  }
                />
                <Slider
                  size="small"
                  value={profile[slider.key]}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  disabled={!enabled}
                  aria-label={slider.label}
                  onChange={(_event, value) => {
                    setProfile((prev) => ({ ...prev, [slider.key]: value }));
                  }}
                />
              </Stack>
            </Box>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Chip
          size="small"
          color={plottable ? 'primary' : 'default'}
          label={`${summary.size.toLocaleString()} similar cases`}
        />
        <Typography variant="caption" aria-live="polite">
          {plottable
            ? `Matching within ±${String(DEFAULT_TOLERANCES.age)} yrs, ±${String(DEFAULT_TOLERANCES.bmi)} BMI, ±${String(DEFAULT_TOLERANCES.heightCm)} cm, ±${String(DEFAULT_TOLERANCES.asa)} ASA`
            : `Fewer than ${String(MINIMUM_COHORT)} — switch off a criterion to widen the match`}
        </Typography>
      </Stack>

      <div ref={containerRef} style={{ width: '100%' }}>
        {width > 0 && (
          <RiskRadar
            axes={summary.axes}
            cohortSize={summary.size}
            plottable={plottable}
            width={width}
            height={CHART_HEIGHT}
            description={description}
          />
        )}
      </div>

      <Typography variant="caption" component="p" sx={{ mt: 1 }}>
        Each spoke is this cohort&rsquo;s rate divided by the whole dataset&rsquo;s, so the dashed
        ring is average risk. The shaded band is the 95% interval — when it is wide, the cohort is
        small, not the risk variable. Compare spokes against the ring rather than reading the size
        of the shape.
      </Typography>
    </ChartCard>
  );
}
