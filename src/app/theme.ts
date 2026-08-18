import { createTheme } from '@mui/material/styles';

/**
 * Dark slate palette, carried over from the original so the rebuild is
 * recognisably the same product.
 *
 * Chart colours are declared here rather than inside chart components. Charts
 * receive them as props, which keeps those components free of theme lookups
 * and means a palette change is one edit rather than seven.
 */
export const chartPalette = {
  // Categorical. Chosen to stay distinguishable under the common forms of
  // colour vision deficiency, which ruled out the original's red/green pairing.
  categorical: ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee'],
  // Ordinal severity. Used only where an ordering genuinely exists.
  severity: { low: '#34d399', medium: '#fbbf24', high: '#f87171' },
  grid: '#334155',
  axis: '#94a3b8',
  // Marks representing an estimate too uncertain to read as a point value.
  uncertain: '#64748b',
} as const;

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0f172a', paper: '#1e293b' },
    primary: { main: '#60a5fa' },
    secondary: { main: '#f472b6' },
    error: { main: '#f87171' },
    warning: { main: '#fbbf24' },
    success: { main: '#34d399' },
    text: { primary: '#f1f5f9', secondary: '#94a3b8' },
    divider: '#334155',
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.2 },
    h2: { fontSize: '1.375rem', fontWeight: 600, lineHeight: 1.25 },
    // Panel titles. Small, but never below 0.8rem — chart labels are already
    // dense and shrinking the headings makes the hierarchy unreadable.
    h3: { fontSize: '1rem', fontWeight: 600 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', color: '#94a3b8' },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // The original set `overflow: hidden` on body for its slide deck, which
        // is why content below 900px was unreachable. A dashboard scrolls.
        body: { overflowY: 'auto' },
        // Every focusable element gets a visible ring. MUI's default outline is
        // easy to lose against a dark background.
        ':focus-visible': { outline: '2px solid #60a5fa', outlineOffset: '2px' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #334155', backgroundImage: 'none' },
      },
    },
    MuiButtonBase: {
      // Ripple is decorative and costs a paint on every interaction; the charts
      // need that budget more.
      defaultProps: { disableRipple: true },
    },
  },
});
