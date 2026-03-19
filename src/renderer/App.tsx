import React, { useState, useCallback, useRef } from 'react';
import { Phase, EmailMeta, EmailDetail } from './types';
import Titlebar from './Titlebar';
import SearchBar from './SearchBar';
import EmailList from './EmailList';
import EmailDetailPanel from './EmailDetail';

const PAGE_SIZE = 100;

export default function App() {
  const [phase, setPhase] = useState<Phase>('empty');
  const [fileName, setFileName] = useState('ファイル未選択');
  const [loadProgress, setLoadProgress] = useState({ percent: 0, count: 0 });

  const [displayedEmails, setDisplayedEmails] = useState<EmailMeta[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [excludeUnknown, setExcludeUnknown] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentMeta, setCurrentMeta] = useState<EmailMeta | null>(null);
  const [currentDetail, setCurrentDetail] = useState<EmailDetail | null>(null);
  const [viewMode, setViewMode] = useState<'html' | 'plain'>('html');

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const openFile = useCallback(async () => {
    const fp = await window.api.openMboxFile();
    if (!fp) return;

    setFileName(fp.split('/').pop() || fp);
    setPhase('loading');
    setLoadProgress({ percent: 0, count: 0 });

    window.api.offLoadProgress();
    window.api.onLoadProgress(({ percent, count }) => {
      setLoadProgress({ percent, count });
    });

    const result = await window.api.readMbox(fp);
    window.api.offLoadProgress();

    if (result.error) {
      alert('読み込みエラー: ' + result.error);
      setPhase('empty');
      return;
    }

    setTotalCount(result.total ?? 0);
    setQuery('');
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
    const q = e.target.value;
    setQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(q, sortOrder, excludeUnknown), 200);
  }, [sortOrder, excludeUnknown, runSearch]);

  const handleExcludeUnknownChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const eu = e.target.checked;
    setExcludeUnknown(eu);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    runSearch(query, sortOrder, eu);
  }, [query, sortOrder, runSearch]);

  const handleSortToggle = useCallback(() => {
    const so = sortOrder === 'desc' ? 'asc' : 'desc';
    setSortOrder(so);
    runSearch(query, so, excludeUnknown);
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

  const isListVisible = phase === 'no-selection' || phase === 'detail';

  return (
    <>
      <Titlebar fileName={fileName} onOpenFile={openFile} />
      <SearchBar
        query={query}
        sortOrder={sortOrder}
        excludeUnknown={excludeUnknown}
        disabled={!isListVisible}
        totalMatched={totalMatched}
        totalCount={totalCount}
        onQueryChange={handleQueryChange}
        onExcludeUnknownChange={handleExcludeUnknownChange}
        onSortToggle={handleSortToggle}
      />
      <div id="main">
        <EmailList
          emails={displayedEmails}
          selectedIndex={selectedIndex}
          totalMatched={totalMatched}
          query={query}
          isVisible={isListVisible}
          hasMore={displayedEmails.length < totalMatched}
          onSelect={selectEmail}
          onLoadMore={handleLoadMore}
        />
        <EmailDetailPanel
          phase={phase}
          loadProgress={loadProgress}
          currentMeta={currentMeta}
          currentDetail={currentDetail}
          viewMode={viewMode}
          onOpenFile={openFile}
          onViewModeChange={setViewMode}
        />
      </div>
    </>
  );
}
