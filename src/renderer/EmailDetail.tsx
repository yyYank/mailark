import { useEffect, useRef } from 'react';
import { Phase, EmailMeta, EmailDetail as EmailDetailType } from './types';
import { escHtml, fileIcon } from './utils';
import { ThemeMode } from './theme';
import { getEmailFrameStyles } from './emailFrameTheme';

// トップレベル（メール全体の区切り）：全幅
const HR_STYLE = 'border:none;border-top:1px solid #ccc;margin:8px 0';
// インライン（返信・転送の区切り）：左インデントで短く
const HR_INLINE_STYLE = 'border:none;border-top:1px solid #ddd;margin:0 0 0 16px;width:calc(100% - 32px)';

/** テキスト中のメールアドレスを <b> で囲む（escHtml 後のテキストに適用） */
function boldEmails(escapedText: string): string {
  return escapedText.replace(
    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
    '<b>$1</b>',
  );
}

/**
 * インライン帰属行ブロックのHTML文字列を生成する。
 * 上下にmarginを取り、短いhrで囲むことで「会話の区切り」を表現する。
 */
function inlineAttrBlock(content: string): string {
  return `<div style="margin:14px 0 10px 0">`
    + `<hr style="${HR_INLINE_STYLE}">`
    + `<div style="font-size:12px;color:#555;padding:5px 0 5px 16px">${content}</div>`
    + `<hr style="${HR_INLINE_STYLE}">`
    + `</div>`;
}

/**
 * 文字列が「メールアドレス + 日付」形式の帰属行かどうかを判定する。
 * 例: "user@example.com　February 16, 2026 at 11:18:09 AM GMT+9"
 */
function isAttributionLine(text: string): boolean {
  const t = text.trim();
  return (
    t.length > 5 &&
    t.length < 200 &&
    /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}[\s\u3000]/.test(t) &&
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|20\d{2}|\+\d{4}|-\d{4}|GMT[+-]?\d+/i.test(t)
  );
}

/**
 * HTML本文にセパレーターを挿入する。
 * 1) blockquote の前（帰属行があればその前後）に <hr> を挿入
 * 2) メールアドレス+日付のみを含む <p>/<div> 要素の前後に <hr> を挿入
 */
function addEmailSeparators(htmlStr: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');

  /** 帰属行ブロックのラッパーdivノードを生成 */
  const makeAttrWrapper = (innerHtml: string): Element => {
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = inlineAttrBlock(innerHtml);
    return wrapper;
  };

  const makeHr = () => {
    const hr = doc.createElement('hr');
    hr.setAttribute('style', HR_INLINE_STYLE);
    return hr;
  };

  // Pass 1: <blockquote> ベースの引用（Apple Mail / Thunderbird 等）
  Array.from(doc.querySelectorAll('blockquote')).forEach(bq => {
    const parent = bq.parentNode;
    if (!parent) return;

    let attribution: Element | null = null;
    let node: ChildNode | null = bq.previousSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? '').trim()) break;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName !== 'BR') { attribution = el; break; }
      }
      node = node.previousSibling;
    }

    const attrText = attribution?.textContent ?? '';
    const isAttr = attribution !== null && (
      /@/.test(attrText) ||
      /wrote:/i.test(attrText) ||
      /forwarded message/i.test(attrText) ||
      /original message/i.test(attrText)
    );

    if (isAttr && attribution) {
      // 帰属行をラッパーdivに置き換え
      const wrapper = makeAttrWrapper(boldEmails(escHtml(attrText)));
      parent.insertBefore(wrapper, attribution);
      attribution.remove();
      // blockquoteの前にhr（blockquote自体の区切り）
      parent.insertBefore(makeHr(), bq);
    } else {
      parent.insertBefore(makeHr(), bq);
    }
  });

  // Pass 2: PST 等の「email + date」のみを含む <p>/<div> 要素
  Array.from(doc.querySelectorAll('p, div')).forEach(el => {
    if (el.closest('blockquote')) return;
    if (el.querySelector('p, div, blockquote, table')) return;
    // すでにラッパーdivの中にいる場合はスキップ
    if ((el.previousElementSibling as Element | null)?.getAttribute('style')?.includes('margin:14px')) return;

    const text = el.textContent ?? '';
    if (!isAttributionLine(text)) return;

    const wrapper = makeAttrWrapper(boldEmails(escHtml(text)));
    el.parentNode!.insertBefore(wrapper, el);
    el.remove();
  });

  return doc.body.innerHTML;
}

/**
 * プレーンテキスト本文を処理し、帰属行の前後に <hr> を挿入する。
 * 帰属行以外は <pre> で囲んで改行・空白を保持する。
 */
function processPlainBody(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];
  const preLines: string[] = [];

  const flushPre = () => {
    if (preLines.length === 0) return;
    parts.push(`<pre style="font-family:monospace;white-space:pre-wrap;margin:0">${preLines.join('\n')}</pre>`);
    preLines.length = 0;
  };

  for (const line of lines) {
    if (isAttributionLine(line)) {
      flushPre();
      parts.push(inlineAttrBlock(boldEmails(escHtml(line))));
    } else {
      preLines.push(escHtml(line));
    }
  }
  flushPre();
  return parts.join('\n');
}

interface Props {
  phase: Phase;
  loadProgress: { percent: number; count: number };
  currentMeta: EmailMeta | null;
  currentDetail: EmailDetailType | null;
  theme: ThemeMode;
  viewMode: 'html' | 'plain';
  onOpenFile: () => void;
  onViewModeChange: (mode: 'html' | 'plain') => void;
}

export default function EmailDetail({
  phase, loadProgress, currentMeta, currentDetail,
  theme,
  viewMode, onOpenFile, onViewModeChange,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !currentDetail || !currentMeta) return;
    if (viewMode === 'html') {
      const rawBody = currentDetail.htmlBody
        ? addEmailSeparators(currentDetail.htmlBody)
        : processPlainBody(currentDetail.body || '(本文なし)');
      const hr = `<hr style="${HR_STYLE}">`;
      const meta = `<div style="font-size:12px;color:#555;padding:2px 0">
        <b>${escHtml(currentMeta.from)}</b>　${escHtml(currentMeta.date)}
      </div>`;
      const frameStyles = getEmailFrameStyles(theme);
      const html = `<html><body style="margin:16px;font-family:sans-serif">
        <style>${frameStyles}</style>
        ${hr}${meta}${hr}
        ${rawBody}
      </body></html>`;
      iframeRef.current.srcdoc = html;
    }
  }, [currentDetail, currentMeta, theme, viewMode]);

  return (
    <div id="email-detail">
      {phase === 'empty' && (
        <div id="empty-state">
          <div className="icon">📬</div>
          <div className="title">mailark</div>
          <div className="sub">mailark でメールアーカイブを開くと、一覧と本文を表示できます</div>
          <button className="open-link" onClick={onOpenFile}>ファイルを選択</button>
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
