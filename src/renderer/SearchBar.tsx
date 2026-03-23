import React from 'react';

import { SearchStatus, describeSearchStatus } from '../searchStatus';

interface Props {
  query: string;
  sortOrder: 'asc' | 'desc';
  excludeUnknown: boolean;
  disabled: boolean;
  totalMatched: number;
  totalCount: number;
  searchStatus: SearchStatus;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onQueryKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onQueryCompositionStart: () => void;
  onQueryCompositionEnd: () => void;
  onExcludeUnknownChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSortToggle: () => void;
}

export default function SearchBar({
  query, sortOrder, excludeUnknown, disabled,
  totalMatched, totalCount, searchStatus,
  onQueryChange, onQueryKeyDown, onQueryCompositionStart, onQueryCompositionEnd,
  onExcludeUnknownChange, onSortToggle,
}: Props) {
  return (
    <div id="search-bar">
      <input
        type="text"
        id="search-input"
        placeholder="検索... (例: from:gmail.com since:2022-1-1 会議)"
        disabled={disabled}
        value={query}
        onChange={onQueryChange}
        onKeyDown={onQueryKeyDown}
        onCompositionStart={onQueryCompositionStart}
        onCompositionEnd={onQueryCompositionEnd}
      />
      <label id="filter-unknown-label">
        <input
          type="checkbox"
          id="filter-unknown"
          checked={excludeUnknown}
          onChange={onExcludeUnknownChange}
        /> unknown除外
      </label>
      <button
        id="sort-btn"
        disabled={disabled}
        className={sortOrder === 'asc' ? 'active' : ''}
        onClick={onSortToggle}
      >
        {sortOrder === 'desc' ? '日付 ↓' : '日付 ↑'}
      </button>
      <span id="mail-count">
        {!disabled ? `${totalMatched} / ${totalCount} 件` : '—'}
      </span>
      <span id="search-status">
        {describeSearchStatus(searchStatus)}
      </span>
    </div>
  );
}
