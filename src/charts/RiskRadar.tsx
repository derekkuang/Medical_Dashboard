import { type ReactElement } from 'react';
import type { RadarAxis } from '@/transforms/cohort';
import { riskRatio } from '@/transforms/cohort';
import { ChartFrame } from './primitives/ChartFrame';
import { chartPalette } from './palette';

interface RiskRadarProps {
  axes: readonly RadarAxis[];
  cohortSize: number;
  /** False when the cohort is too small to support the estimates. */
  plottable: boolean;
  width: number;
  height: number;
  description: string;
}

/** Outermost ring. Ratios above this clamp, and the label says so. */
const MAX_RATIO = 4;

interface Vertex {
  x: number;
  y: number;
}

function vertex(angleRadians: number, radius: number): Vertex {
  return { x: Math.cos(angleRadians) * radius, y: Math.sin(angleRadians) * radius };
}

function polygon(points: readonly Vertex[]): string {
  if (points.length === 0) return '';
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}Z`;
}

/**
 * Outcome risk for a matched cohort, relative to the whole dataset.
 *
 * A rebuild of the original's radar with four defects removed.
 *
 * Every spoke is the same quantity — this cohort's rate for an adverse outcome
 * divided by the dataset's rate for the same outcome. The original plotted ICU
 * days against mortality percent against millilitres of blood, so its triangle
 * had no consistent meaning and changing the axis order changed the "risk
 * profile" of identical patients.
 *
 * The ratio, rather than the raw probability, is what makes the axes
 * comparable. These outcomes differ in frequency by more than an order of
 * magnitude — 18.8% for ICU admission against 0.89% for mortality — so on a
 * shared absolute scale the mortality spoke would sit invisibly against the
 * centre at any realistic risk.
 *
 * The shaded band is the 95% interval, drawn as a ring between the lower-bound
 * and upper-bound polygons. It is the honest part: a cohort of forty patients
 * produces a band wide enough to swallow the estimate, and the original drew
 * exactly that situation as a single confident triangle.
 *
 * Radar charts deserve their reputation, and none of the above rescues area as
 * a readable quantity — area still grows with the square of the values. This
 * chart is for comparing spokes against the baseline ring and against each
 * other, which it does honestly; it is not for reading the size of the shape.
 */
export function RiskRadar({
  axes,
  cohortSize,
  plottable,
  width,
  height,
  description,
}: RiskRadarProps): ReactElement {
  return (
    <ChartFrame
      width={width}
      height={height}
      margin={{ top: 28, right: 96, bottom: 28, left: 96 }}
      title="Outcome risk relative to the dataset"
      description={description}
    >
      {({ innerWidth, innerHeight }) => {
        const radius = Math.max(10, Math.min(innerWidth, innerHeight) / 2);
        const centreX = innerWidth / 2;
        const centreY = innerHeight / 2;

        const angleFor = (index: number): number =>
          -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, axes.length);

        const toRadius = (ratio: number): number =>
          (Math.min(ratio, MAX_RATIO) / MAX_RATIO) * radius;

        const verticesFor = (bound: 'estimate' | 'lower' | 'upper'): Vertex[] =>
          axes.map((axis, i) => vertex(angleFor(i), toRadius(riskRatio(axis, bound) ?? 0)));

        return (
          <g transform={`translate(${String(centreX)},${String(centreY)})`}>
            {[1, 2, 3, 4].map((ring) => (
              <circle
                key={ring}
                r={(ring / MAX_RATIO) * radius}
                fill="none"
                // The 1x ring is the dataset average, and is the reference the
                // whole chart is read against, so it is not just another
                // gridline.
                stroke={ring === 1 ? chartPalette.axis : chartPalette.grid}
                strokeWidth={ring === 1 ? 1.5 : 1}
                strokeDasharray={ring === 1 ? '4 3' : undefined}
                aria-hidden
              />
            ))}

            {axes.map((axis, i) => {
              const end = vertex(angleFor(i), radius);
              return (
                <line
                  key={`spoke-${axis.key}`}
                  x1={0}
                  y1={0}
                  x2={end.x}
                  y2={end.y}
                  stroke={chartPalette.grid}
                  aria-hidden
                />
              );
            })}

            {plottable && (
              <>
                {/* Two subpaths with evenodd: the upper polygon minus the lower
                    one, which renders the interval as a band rather than two
                    overlapping shapes. */}
                <path
                  className="radar-band"
                  d={`${polygon(verticesFor('upper'))} ${polygon(verticesFor('lower'))}`}
                  fillRule="evenodd"
                  fill={chartPalette.categorical[1]}
                  opacity={0.22}
                />
                <path
                  className="radar-estimate"
                  d={polygon(verticesFor('estimate'))}
                  fill="none"
                  stroke={chartPalette.categorical[1]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {verticesFor('estimate').map((v, i) => (
                  <circle
                    key={`dot-${axes[i]?.key ?? String(i)}`}
                    cx={v.x}
                    cy={v.y}
                    r={3.5}
                    fill={chartPalette.categorical[1]}
                  />
                ))}
              </>
            )}

            {axes.map((axis, i) => {
              const at = vertex(angleFor(i), radius + 16);
              const ratio = riskRatio(axis, 'estimate');
              const percent = axis.estimate === null ? null : axis.estimate.estimate * 100;

              return (
                <g key={`label-${axis.key}`}>
                  <text
                    x={at.x}
                    y={at.y}
                    textAnchor={at.x > 1 ? 'start' : at.x < -1 ? 'end' : 'middle'}
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={chartPalette.axis}
                  >
                    {axis.label}
                  </text>
                  <text
                    x={at.x}
                    y={at.y + 13}
                    textAnchor={at.x > 1 ? 'start' : at.x < -1 ? 'end' : 'middle'}
                    dominantBaseline="middle"
                    fontSize={10}
                    fill={plottable ? chartPalette.highlight : chartPalette.unrecorded}
                  >
                    {percent === null || ratio === null
                      ? 'not recorded'
                      : `${percent.toFixed(1)}% · ${ratio > MAX_RATIO ? `>${String(MAX_RATIO)}` : ratio.toFixed(1)}× baseline`}
                  </text>
                </g>
              );
            })}

            {!plottable && (
              // No polygon at all below the floor. Drawing one anyway is the
              // original's central mistake: a confident triangle from a cohort
              // that cannot support a single one of its three numbers.
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fill={chartPalette.unrecorded}
              >
                {`Only ${String(cohortSize)} similar cases — too few to estimate`}
              </text>
            )}
          </g>
        );
      }}
    </ChartFrame>
  );
}
