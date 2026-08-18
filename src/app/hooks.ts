import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

// Pre-typed so no call site has to restate the store's types, and so a selector
// reading a field that does not exist is a compile error rather than undefined.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
