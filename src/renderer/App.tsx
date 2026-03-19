import React, { useState, useEffect, useCallback, useRef } from 'react';

const PAGE_SIZE = 100;

interface EmailMeta {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  dateObj: number;
  attachmentCount: number;
}

interface Attachment {
  filename: string;
  contentType: string;
  data: string;
  encoding: string;
}

interface EmailDetail {
  body: string;
  htmlBody: string;
  attachments: Attachment[];
}

type Phase = 'empty' | 'loading' | 'no-selection' | 'detail';

declare global {
  interface Window {
    api: {
      openMboxFile: () => Promise<string | null>;
      readMbox: (filePath: string) => Promise<{ total?: number; error?: string }>;
      getEmailDetail: (id: string) => Promise<EmailDetail>;
      searchEmails: (params: {
        query: string;
        offset: number;
        limit: number;
        sortOrder: 'asc' | 'desc';
        excludeUnknown: boolean;
      }) => Promise<{ total: number; emails: EmailMeta[] }>;
      saveAttachment: (data: { filename: string; data: string }) => Promise<string>;
      onLoadProgress: (cb: (data: { percent: number; count: number }) => void) => void;
      offLoadProgress: () => void;
    };
  }
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(text: string, query: string): string {
  if (!query) return escHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<span class="highlight">$1</span>');
}

function fileIcon(ct: string): string {
  if (ct.includes('image')) return '🖼️';
  if (ct.includes('pdf')) return '📄';
  if (ct.includes('zip') || ct.includes('compressed')) return '🗜️';
  if (ct.includes('video')) return '🎬';
  if (ct.includes('audio')) return '🎵';
  if (ct.includes('text')) return '📝';
  return '📎';
}

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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // iframeのsrcdocをrefで更新（React管理外）
  useEffect(() => {
    if (!iframeRef.current || !currentDetail) return;
    if (viewMode === 'html') {
      const html = currentDetail.htmlBody ||
        `<pre style="font-family:monospace;padding:24px">${escHtml(currentDetail.body || '(本文なし)')}</pre>`;
      iframeRef.current.srcdoc = html;
    }
  }, [currentDetail, viewMode]);

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

  const handleExcludeUnknown = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  const hasMore = displayedEmails.length < totalMatched;

  return (
    <>
      {/* TITLEBAR */}
      <div id="titlebar">
        <span className="app-name">MBOX//</span>
        <span className="file-name">{fileName}</span>
        <div className="spacer"></div>
        <button id="open-btn" onClick={openFile}>📂 mboxを開く</button>
      </div>

      {/* SEARCH BAR */}
      <div id="search-bar">
        <input
          type="text"
          id="search-input"
          placeholder="差出人、件名、本文で検索..."
          disabled={!isListVisible}
          value={query}
          onChange={handleQueryChange}
        />
        <label id="filter-unknown-label">
          <input
            type="checkbox"
            id="filter-unknown"
            checked={excludeUnknown}
            onChange={handleExcludeUnknown}
          /> unknown除外
        </label>
        <button
          id="sort-btn"
          disabled={!isListVisible}
          className={sortOrder === 'asc' ? 'active' : ''}
          onClick={handleSortToggle}
        >
          {sortOrder === 'desc' ? '日付 ↓' : '日付 ↑'}
        </button>
        <span id="mail-count">
          {isListVisible ? `${totalMatched} / ${totalCount} 件` : '—'}
        </span>
      </div>

      {/* MAIN */}
      <div id="main">
        {/* EMAIL LIST */}
        <div id="email-list">
          {!isListVisible && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
              mboxファイルを開いてください
            </div>
          )}
          {isListVisible && totalMatched === 0 && (
            <div id="email-list-empty">該当するメールがありません</div>
          )}
          {isListVisible && displayedEmails.map((em, i) => (
            <div
              key={em.id}
              className={`email-item${selectedIndex === i ? ' active' : ''}`}
              tabIndex={0}
              onClick={() => selectEmail(i)}
              onKeyDown={e => { if (e.key === 'Enter') selectEmail(i); }}
            >
              <div className="from" dangerouslySetInnerHTML={{ __html: highlight(em.from, query) }} />
              <div className="subject" dangerouslySetInnerHTML={{ __html: highlight(em.subject, query) }} />
              <div className="meta">
                <span className="date">{formatDate(em.dateObj)}</span>
                {em.attachmentCount > 0 && (
                  <span className="attach-badge">📎 {em.attachmentCount}</span>
                )}
              </div>
            </div>
          ))}
          {isListVisible && hasMore && (
            <div
              id="load-more-btn"
              style={{ padding: '14px', textAlign: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', fontFamily: "'DM Mono', monospace", borderTop: '1px solid var(--border)' }}
              onClick={handleLoadMore}
            >
              もっと見る ({displayedEmails.length} / {totalMatched})
            </div>
          )}
        </div>

        {/* EMAIL DETAIL */}
        <div id="email-detail">
          {phase === 'empty' && (
            <div id="empty-state">
              <div className="icon">📬</div>
              <div className="title">mbox Viewer</div>
              <div className="sub">mboxファイルを開くと、メールの一覧と本文を表示できます</div>
              <button className="open-link" onClick={openFile}>mboxファイルを選択</button>
            </div>
          )}

          {phase === 'loading' && (
            <div id="loading" style={{ display: 'flex' }}>
              <div className="loading-label">取り込み中</div>
              <div id="progress-track">
                <div id="progress-bar" style={{ width: `${loadProgress.percent}%` }}></div>
              </div>
              <div id="progress-detail">{loadProgress.percent}% — {loadProgress.count}件</div>
            </div>
          )}

          {phase === 'no-selection' && (
            <div id="no-selection" style={{ display: 'flex' }}>
              <span>← メールを選択してください</span>
            </div>
          )}

          {phase === 'detail' && currentMeta && (
            <div id="detail-content" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div id="detail-header">
                <div id="detail-subject">{currentMeta.subject}</div>
                <div className="detail-meta">
                  <span className="label">From</span>
                  <span className="value">{currentMeta.from}</span>
                  <span className="label">To</span>
                  <span className="value">{currentMeta.to || '—'}</span>
                  <span className="label">Date</span>
                  <span className="value">{currentMeta.date || '—'}</span>
                </div>
              </div>

              {currentDetail && currentDetail.attachments.length > 0 && (
                <div id="attachments-area" style={{ display: 'flex' }}>
                  {currentDetail.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="attach-chip"
                      onClick={() => window.api.saveAttachment({ filename: att.filename, data: att.data })}
                    >
                      <span className="attach-icon">{fileIcon(att.contentType)}</span>
                      <span className="attach-name">{att.filename}</span>
                      <span className="attach-type">{att.contentType.split('/')[1] || 'file'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div id="view-toggle">
                <button
                  className={`view-btn${viewMode === 'html' ? ' active' : ''}`}
                  onClick={() => setViewMode('html')}
                >HTML</button>
                <button
                  className={`view-btn${viewMode === 'plain' ? ' active' : ''}`}
                  onClick={() => setViewMode('plain')}
                >テキスト</button>
              </div>

              {viewMode === 'plain' && (
                <div id="email-body">
                  {currentDetail ? (currentDetail.body || '(本文なし)') : '読み込み中...'}
                </div>
              )}
              {viewMode === 'html' && (
                <iframe
                  ref={iframeRef}
                  id="email-body-html"
                  style={{ display: 'block' }}
                  sandbox="allow-same-origin"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
