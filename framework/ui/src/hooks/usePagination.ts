/**
 * Generic Pagination Hook
 */

import { useState, useCallback, useMemo } from 'react';

export interface PaginationState {
  page: number;
  limit: number;
}

export interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
  maxLimit?: number;
}

export interface UsePaginationReturn {
  page: number;
  limit: number;
  offset: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  reset: () => void;
}

export function usePagination(
  options: UsePaginationOptions = {}
): UsePaginationReturn {
  const {
    initialPage = 1,
    initialLimit = 20,
    maxLimit = 100,
  } = options;

  const [page, setPageState] = useState(initialPage);
  const [limit, setLimitState] = useState(initialLimit);

  const offset = useMemo(() => (page - 1) * limit, [page, limit]);

  const setPage = useCallback((newPage: number) => {
    if (newPage >= 1) {
      setPageState(newPage);
    }
  }, []);

  const setLimit = useCallback((newLimit: number) => {
    const clampedLimit = Math.min(Math.max(1, newLimit), maxLimit);
    setLimitState(clampedLimit);
    setPageState(1); // Reset to first page when limit changes
  }, [maxLimit]);

  const nextPage = useCallback(() => {
    setPageState(prev => prev + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPageState(prev => Math.max(1, prev - 1));
  }, []);

  const goToPage = useCallback((targetPage: number) => {
    if (targetPage >= 1) {
      setPageState(targetPage);
    }
  }, []);

  const reset = useCallback(() => {
    setPageState(initialPage);
    setLimitState(initialLimit);
  }, [initialPage, initialLimit]);

  return {
    page,
    limit,
    offset,
    setPage,
    setLimit,
    nextPage,
    prevPage,
    goToPage,
    reset,
  };
}
