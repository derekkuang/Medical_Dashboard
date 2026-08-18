import { parseCases, type ParsedCases } from './parseCases';

/**
 * Resolved against Vite's base URL rather than hardcoded to '/cases.csv', so
 * the app still finds its data when served from a sub-path.
 */
export const CASES_URL = `${import.meta.env.BASE_URL}cases.csv`;

/**
 * Fetches and parses the case table.
 *
 * The signal is required, not optional. RTK Query supplies one per request, and
 * honouring it means a 2.1 MB download is dropped when the component unmounts
 * or the query is superseded, rather than running to completion and parsing a
 * result nobody is waiting for.
 *
 * Failures carry the status, not a generic message: a 404 (missing asset) and a
 * 503 (server unhealthy) call for different responses from whoever is looking
 * at the screen.
 */
export async function fetchCases(signal: AbortSignal): Promise<ParsedCases> {
  const response = await fetch(CASES_URL, { signal });

  if (!response.ok) {
    throw new Error(`Could not load the case table: HTTP ${String(response.status)}`);
  }

  return parseCases(await response.text());
}
