import { useEffect, useState } from 'react';
import { useMailbox } from './useMailbox';
import Titlebar from './Titlebar';
import SearchBar from './SearchBar';
import EmailList from './EmailList';
import EmailDetailPanel from './EmailDetail';
import { applyTheme, getStoredTheme, nextTheme, saveTheme, ThemeMode } from './theme';

export default function App() {
  const {
    phase, fileName, loadProgress,
    displayedEmails, totalMatched, totalCount,
    query, sortOrder, excludeUnknown,
    selectedIndex, currentMeta, currentDetail,
    viewMode, setViewMode,
    openFile,
    handleQueryChange, handleExcludeUnknownChange, handleSortToggle,
    selectEmail, handleLoadMore,
  } = useMailbox();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme(window.localStorage));

  const isListVisible = phase === 'no-selection' || phase === 'detail';

  useEffect(() => {
    applyTheme(theme, document.body);
    saveTheme(theme, window.localStorage);
  }, [theme]);

  return (
    <>
      <Titlebar
        fileName={fileName}
        onOpenFile={openFile}
        theme={theme}
        onToggleTheme={() => setTheme(prev => nextTheme(prev))}
      />
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
