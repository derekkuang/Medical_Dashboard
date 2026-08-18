/**
 * Chart colours.
 *
 * Lives under charts/ rather than in the MUI theme because charts are forbidden
 * from importing app/ — a chart that can reach the theme provider can reach the
 * store. These are presentation constants with no dependency on application
 * state, so importing them here respects that boundary rather than working
 * around it.
 */
export const chartPalette = {
  /**
   * Categorical. Blue and pink read as distinct under the common forms of
   * colour vision deficiency; the original's red/green pairing does not.
   */
  categorical: ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee'],

  /** Sex split. Deliberately not the pink/blue stereotype ordering. */
  male: '#60a5fa',
  female: '#f472b6',

  /**
   * Values that exist but were never recorded. Given a visible, muted colour
   * rather than being dropped, so a bar's segments always sum to its total.
   */
  unrecorded: '#64748b',

  /** Ordinal severity. Used only where an ordering genuinely exists. */
  severity: { low: '#34d399', medium: '#fbbf24', high: '#f87171' },

  grid: '#334155',
  axis: '#94a3b8',
  highlight: '#f8fafc',
} as const;
