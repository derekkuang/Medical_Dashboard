import {
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useMemo, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import type { SurgeryCase } from '@/data/schema';
import {
  allFiltersCleared,
  departmentToggled,
  emergencyOnlySet,
  sexSelected,
} from '@/features/filters/filtersSlice';
import { selectActiveFilterCount, selectFilters } from '@/features/filters/selectors';
import { facetCounts } from '@/transforms/facets';

interface FilterToolbarProps {
  cases: readonly SurgeryCase[];
  matchedCount: number;
}

const ALL = '__all__';

export function FilterToolbar({ cases, matchedCount }: FilterToolbarProps): ReactElement {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectFilters);
  const activeCount = useAppSelector(selectActiveFilterCount);

  // Facets come from the full table, not the filtered cohort. Deriving them
  // from the cohort would make options vanish as soon as they were selected,
  // leaving no way to switch between them.
  const departments = useMemo(() => facetCounts(cases, 'department'), [cases]);

  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'stretch', md: 'center' } }}
      >
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="department-label">Department</InputLabel>
          <Select
            labelId="department-label"
            label="Department"
            value={filters.department ?? ALL}
            onChange={(e) => {
              const next = e.target.value;
              // departmentToggled is a toggle, so dispatching the current value
              // clears it — which is exactly what "All departments" means here.
              dispatch(departmentToggled(next === ALL ? (filters.department ?? '') : next));
            }}
          >
            <MenuItem value={ALL}>All departments</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d.value} value={d.value}>
                {d.value} ({d.count.toLocaleString()})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="sex-label">Sex</InputLabel>
          <Select
            labelId="sex-label"
            label="Sex"
            value={filters.sex ?? ALL}
            onChange={(e) => {
              const next = e.target.value;
              dispatch(sexSelected(next === ALL ? null : next === 'M' ? 'M' : 'F'));
            }}
          >
            <MenuItem value={ALL}>Any</MenuItem>
            <MenuItem value="M">Male</MenuItem>
            <MenuItem value="F">Female</MenuItem>
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={filters.emergencyOnly}
              onChange={(e) => dispatch(emergencyOnlySet(e.target.checked))}
            />
          }
          label="Emergency only"
        />

        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', ml: { md: 'auto' }, flexShrink: 0 }}
        >
          {/* aria-live: the count changes as a consequence of a control the
              user just operated, so it must be announced without being focused. */}
          <Typography variant="body2" aria-live="polite">
            <strong>{matchedCount.toLocaleString()}</strong> of {cases.length.toLocaleString()}{' '}
            cases
          </Typography>
          {activeCount > 0 && (
            <>
              <Chip size="small" label={`${String(activeCount)} active`} color="primary" />
              <Button size="small" onClick={() => dispatch(allFiltersCleared())}>
                Clear
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
