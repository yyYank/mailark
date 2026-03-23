import React, { useState, useCallback, useRef } from 'react';
import { Phase, EmailMeta, EmailDetail } from './types';
import { shouldSubmitSearch } from '../searchInputBehavior';
import { SearchStatus } from '../searchStatus';

const PAGE_SIZE = 100;

export function useMailbox() {
  const [phase, setPhase] = useState<Phase>('empty');
  const [fileName, setFileName] = useState('ファイル未選択');
  const [loadProgress, setLoadProgress] = useState({ percent: 0, count: 0 });

  const [displayedEmails, setDisplayedEmails] = useState<EmailMeta[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ phase: 'idle' });

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [excludeUnknown, setExcludeUnknown] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentMeta, setCurrentMeta] = useState<EmailMeta | null>(null);
  const [currentDetail, setCurrentDetail] = useState<EmailDetail | null>(null);
  const [viewMode, setViewMode] = useState<'html' | 'plain'>('html');

  const isComposingRef = useRef(false);

  const loadPage = useCallback(async (offset: number, opts: {
    q: string;
    so: 'asc' | 'desc';
    eu: boolean;
    prev: EmailMeta[];
  }) => {
    const result = await window.api.searchEmails({
      query: opts.q,
      offset,
      limit: PAGE_SIZE,
      sortOrder: opts.so,
      excludeUnknown: opts.eu,
    });
    setTotalMatched(result.total);
    setDisplayedEmails(offset === 0 ? result.emails : opts.prev.concat(result.emails));
  }, []);

  React.useEffect(() => {
    window.api.onSearchStatus(status => {
      setSearchStatus(status);
    });

    void window.api.getSearchStatus().then(status => {
      setSearchStatus(status);
    });

    return () => {
      window.api.offSearchStatus();
    };
  }, []);

  const openFile = useCallback(async () => {
    const fps = await window.api.openMboxFile();
    if (!fps || fps.length === 0) return;

    const names = fps.map(fp => fp.split('/').pop() || fp);
    setFileName(names.length === 1 ? names[0] : `${names.length}ファイル`);
    setPhase('loading');
    setLoadProgress({ percent: 0, count: 0 });

    window.api.offLoadProgress();
    window.api.onLoadProgress(({ percent, count }) => {
      setLoadProgress({ percent, count });
    });

    const result = await window.api.readMbox(fps);
    window.api.offLoadProgress();

    if (result.error) {
      alert('読み込みエラー: ' + result.error);
      setPhase('empty');
      return;
    }

    setTotalCount(result.total ?? 0);
    setQuery('');
    setSearchStatus({ phase: 'idle' });
    setSelectedIndex(null);
    setCurrentMeta(null);
    setCurrentDetail(null);

    await loadPage(0, { q: '', so: sortOrder, eu: excludeUnknown, prev: [] });
    setPhase('no-selection');
  }, [sortOrder, excludeUnknown, loadPage]);

  const runSearch = useCallback(async (q: string, so: 'asc' | 'desc', eu: boolean) => {
    await loadPage(0, { q, so, eu, prev: [] });
    setSelectedIndex(null);
    setCurrentMeta(null);
    setCurrentDetail(null);
    if (phase !== 'empty' && phase !== 'loading') setPhase('no-selection');
  }, [phase, loadPage]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleQueryKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent;
    const isComposing = isComposingRef.current || nativeEvent.isComposing;
    if (!shouldSubmitSearch(e.key, isComposing)) return;

    e.preventDefault();
    void runSearch(query, sortOrder, excludeUnknown);
  }, [query, sortOrder, excludeUnknown, runSearch]);

  const handleQueryCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleQueryCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const handleExcludeUnknownChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const eu = e.target.checked;
    setExcludeUnknown(eu);
    void runSearch(query, sortOrder, eu);
  }, [query, sortOrder, runSearch]);

  const handleSortToggle = useCallback(() => {
    const so = sortOrder === 'desc' ? 'asc' : 'desc';
    setSortOrder(so);
    void runSearch(query, so, excludeUnknown);
  }, [sortOrder, query, excludeUnknown, runSearch]);

  const selectEmail = useCallback(async (index: number) => {
    const email = displayedEmails[index];
    if (!email) return;
    setSelectedIndex(index);
    setCurrentMeta(email);
    setCurrentDetail(null);
    setPhase('detail');

    const detail = await window.api.getEmailDetail(email.id);
    setCurrentDetail(detail);
  }, [displayedEmails]);

  const handleLoadMore = useCallback(() => {
    loadPage(displayedEmails.length, { q: query, so: sortOrder, eu: excludeUnknown, prev: displayedEmails });
  }, [displayedEmails, query, sortOrder, excludeUnknown, loadPage]);

  return {
    // state
    phase,
    fileName,
    loadProgress,
    displayedEmails,
    totalMatched,
    totalCount,
    searchStatus,
    query,
    sortOrder,
    excludeUnknown,
    selectedIndex,
    currentMeta,
    currentDetail,
    viewMode,
    setViewMode,
    // handlers
    openFile,
    handleQueryChange,
    handleQueryKeyDown,
    handleQueryCompositionStart,
    handleQueryCompositionEnd,
    handleExcludeUnknownChange,
    handleSortToggle,
    selectEmail,
    handleLoadMore,
  };
}
