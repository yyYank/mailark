import React from 'react';

interface Props {
  query: string;
  sortOrder: 'asc' | 'desc';
  excludeUnknown: boolean;
  disabled: boolean;
  totalMatched: number;
  totalCount: number;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExcludeUnknownChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSortToggle: () => void;
}

export default function SearchBar({
  query, sortOrder, excludeUnknown, disabled,
  totalMatched, totalCount,
  onQueryChange, onExcludeUnknownChange, onSortToggle,
}: Props) {
  return (
    <div id="search-bar">
      <input
        type="text"
        id="search-input"
        placeholder="差出人、件名、本文で検索..."
        disabled={disabled}
        value={query}
        onChange={onQueryChange}
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
    </div>
  );
}
