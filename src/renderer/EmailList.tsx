import { EmailMeta } from './types';
import { formatDate, highlight } from './utils';

interface Props {
  emails: EmailMeta[];
  selectedIndex: number | null;
  totalMatched: number;
  query: string;
  isVisible: boolean;
  hasMore: boolean;
  onSelect: (index: number) => void;
  onLoadMore: () => void;
}

export default function EmailList({
  emails, selectedIndex, totalMatched, query,
  isVisible, hasMore, onSelect, onLoadMore,
}: Props) {
  return (
    <div id="email-list">
      {!isVisible && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
          mboxファイルを開いてください
        </div>
      )}
      {isVisible && totalMatched === 0 && (
        <div id="email-list-empty">該当するメールがありません</div>
      )}
      {isVisible && emails.map((em, i) => (
        <div
          key={em.id}
          className={`email-item${selectedIndex === i ? ' active' : ''}`}
          tabIndex={0}
          onClick={() => onSelect(i)}
          onKeyDown={e => { if (e.key === 'Enter') onSelect(i); }}
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
      {isVisible && hasMore && (
        <div
          id="load-more-btn"
          style={{ padding: '14px', textAlign: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', fontFamily: "'DM Mono', monospace", borderTop: '1px solid var(--border)' }}
          onClick={onLoadMore}
        >
          もっと見る ({emails.length} / {totalMatched})
        </div>
      )}
    </div>
  );
}
