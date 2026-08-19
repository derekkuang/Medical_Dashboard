import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

/**
 * Import restrictions that encode two architecture decisions. Both are written
 * as lint rules rather than README prose, because an architecture rule CI
 * cannot check is only a suggestion.
 */

/** D3 is a maths library here. It is never allowed to touch the DOM. */
const D3_BOUNDARY = [
  {
    name: 'd3',
    message:
      'Import the specific submodule (d3-scale, d3-array, d3-shape…). The d3 meta-package pulls in d3-selection and d3-transition, which would let D3 mutate the DOM that React owns.',
  },
  {
    name: 'd3-axis',
    message:
      'Axes are React components built from scale.ticks(). d3-axis renders imperatively into a node React also controls, which is the exact shared-ownership bug this project is avoiding.',
  },
  {
    name: 'd3-transition',
    message:
      'Transitions belong to React (CSS, or a state-driven interpolation). d3-transition mutates attributes behind React’s back and loses state whenever the component re-renders.',
  },
];

/** Presentational charts may not reach the store, the API, or feature state. */
const CHART_BOUNDARY = [
  {
    group: ['@/app/*', '**/app/store', '**/app/hooks'],
    message:
      'Charts are presentational. A chart that can read the store is a container — move the selector up into containers/ and pass a view model down as props.',
  },
  {
    group: ['@/features/*', '**/features/*'],
    message:
      'Charts must not depend on feature state. Take the already-derived view model as a prop instead.',
  },
  {
    group: ['@/data/*', '**/data/*'],
    message:
      'Charts must not load or know about domain types. Accept a narrow view model (Bin[], Span[], Point[]) rather than SurgeryCase[].',
  },
  {
    group: ['react-redux', '@reduxjs/toolkit'],
    message: 'Charts are presentational — no store access. Connect in containers/ instead.',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },

  // Config files are plain JS and live outside any tsconfig project, so the
  // type-aware ruleset cannot run on them.
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        // Type-aware linting. Slower than syntactic-only, but it is what makes
        // no-floating-promises and no-unnecessary-condition work — both of
        // which matter once telemetry introduces async streams.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // The brief is explicit: no `any`.
      '@typescript-eslint/no-explicit-any': 'error',

      // A leading underscore marks a parameter that exists to satisfy a
      // signature rather than to be used — an interface method whose
      // implementation genuinely ignores an argument. Without this, the only
      // way to silence it is to delete the parameter, which breaks the
      // signature the interface requires.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      'no-restricted-imports': ['error', { paths: D3_BOUNDARY }],
    },
  },

  {
    files: ['src/charts/**/*.{ts,tsx}'],
    rules: {
      // Flat config replaces rather than merges rule options, so the D3
      // restrictions are repeated here alongside the chart-specific ones.
      'no-restricted-imports': ['error', { paths: D3_BOUNDARY, patterns: CHART_BOUNDARY }],
    },
  },

  {
    files: ['src/transforms/**/*.ts', 'src/telemetry/**/*.ts'],
    rules: {
      // Pure logic layer: no React, no DOM. Kept testable without a renderer.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...D3_BOUNDARY,
            {
              name: 'react',
              message:
                'transforms/ and telemetry/ are pure modules — they must be testable without a renderer. Hooks belong in hooks/ or containers/.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      // Fixtures are frequently partial objects cast to a domain type.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Must stay last: switches off everything Prettier owns.
  prettier,
);
