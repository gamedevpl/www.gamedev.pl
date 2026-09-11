import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  DEFAULT_CATALOG_SORT,
  readCatalogFilters,
  readCatalogSortMode,
  writeCatalogFilters,
  writeCatalogSortMode,
  type CatalogFilterId,
  type CatalogSortMode,
} from './catalogSort.js';

// Persisted sort mode and filters, plus the sort menu open state.
export function useCatalogSortAndFilters(): {
  sortMode: CatalogSortMode;
  filters: Set<CatalogFilterId>;
  sortMenuOpen: boolean;
  sortMenuRef: MutableRefObject<HTMLDivElement | null>;
  toggleSortMenu: () => void;
  handleSortChange: (mode: CatalogSortMode) => void;
  toggleFilter: (id: CatalogFilterId) => void;
  clearFilters: () => void;
} {
  const [sortMode, setSortMode] = useState<CatalogSortMode>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_CATALOG_SORT : readCatalogSortMode(),
  );
  const [filters, setFilters] = useState<Set<CatalogFilterId>>(() =>
    typeof localStorage === 'undefined' ? new Set() : readCatalogFilters(),
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  // Close the sort menu on outside tap or Escape; phones lack hover.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortMenuOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortMenuOpen]);

  function toggleSortMenu() {
    setSortMenuOpen((open) => !open);
  }

  function handleSortChange(mode: CatalogSortMode) {
    setSortMode(mode);
    writeCatalogSortMode(mode);
    setSortMenuOpen(false);
  }

  function toggleFilter(id: CatalogFilterId) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCatalogFilters(next);
      return next;
    });
  }

  function clearFilters() {
    setFilters(() => {
      const next = new Set<CatalogFilterId>();
      writeCatalogFilters(next);
      return next;
    });
  }

  return { sortMode, filters, sortMenuOpen, sortMenuRef, toggleSortMenu, handleSortChange, toggleFilter, clearFilters };
}
