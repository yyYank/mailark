import { useEffect, useRef } from 'react';
import { Phase, EmailMeta, EmailDetail as EmailDetailType } from './types';
import { escHtml, fileIcon } from './utils';

interface Props {
  phase: Phase;
  loadProgress: { percent: number; count: number };
  currentMeta: EmailMeta | null;
  currentDetail: EmailDetailType | null;
  viewMode: 'html' | 'plain';
  onOpenFile: () => void;
  onViewModeChange: (mode: 'html' | 'plain') => void;
}

export default function EmailDetail({
  phase, loadProgress, currentMeta, currentDetail,
  viewMode, onOpenFile, onViewModeChange,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !currentDetail || !currentMeta) return;
    if (viewMode === 'html') {
      const bodyContent = currentDetail.htmlBody ||
        `<pre style="font-family:monospace;white-space:pre-wrap">${escHtml(currentDetail.body || '(本文なし)')}</pre>`;
      const hr = `<hr style="border:none;border-top:1px solid #ccc;margin:8px 0">`;
      const meta = `<div style="font-size:12px;color:#555;padding:2px 0">
        ${escHtml(currentMeta.from)}　${escHtml(currentMeta.date)}
      </div>`;
      const html = `<html><body style="margin:16px;font-family:sans-serif">
        ${hr}${meta}${hr}
        ${bodyContent}
      </body></html>`;
      iframeRef.current.srcdoc = html;
    }
  }, [currentDetail, currentMeta, viewMode]);

  return (
    <div id="email-detail">
      {phase === 'empty' && (
        <div id="empty-state">
          <div className="icon">📬</div>
          <div className="title">mbox Viewer</div>
          <div className="sub">mboxファイルを開くと、メールの一覧と本文を表示できます</div>
          <button className="open-link" onClick={onOpenFile}>mboxファイルを選択</button>
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
              onClick={() => onViewModeChange('html')}
            >HTML</button>
            <button
              className={`view-btn${viewMode === 'plain' ? ' active' : ''}`}
              onClick={() => onViewModeChange('plain')}
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
  );
}
