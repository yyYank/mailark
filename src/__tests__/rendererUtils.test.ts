import { escHtml, fileIcon, formatDate, highlight } from '../renderer/utils';

describe('formatDate', () => {
  test('0 はプレースホルダーを返す', () => {
    expect(formatDate(0)).toBe('—');
  });

  test('タイムスタンプを YYYY/MM/DD 形式で返す', () => {
    const ts = new Date(2024, 0, 5, 12, 30, 0).getTime();
    expect(formatDate(ts)).toBe('2024/01/05');
  });
});

describe('escHtml', () => {
  test('HTML 特殊文字をエスケープする', () => {
    expect(escHtml('<tag attr="x">a & b</tag>')).toBe('&lt;tag attr=&quot;x&quot;&gt;a &amp; b&lt;/tag&gt;');
  });
});

describe('highlight', () => {
  test('クエリが空なら HTML エスケープだけを行う', () => {
    expect(highlight('<b>Hello</b>', '')).toBe('&lt;b&gt;Hello&lt;/b&gt;');
  });

  test('大文字小文字を無視して一致箇所をハイライトする', () => {
    expect(highlight('Hello hello', 'hello')).toBe('<span class="highlight">Hello</span> <span class="highlight">hello</span>');
  });

  test('正規表現の特殊文字を含むクエリもリテラルとして扱う', () => {
    expect(highlight('a+b a?b', 'a+b')).toBe('<span class="highlight">a+b</span> a?b');
  });

  test('ハイライト前に本文をエスケープする', () => {
    expect(highlight('<script>alert(1)</script>', 'alert')).toBe('&lt;script&gt;<span class="highlight">alert</span>(1)&lt;/script&gt;');
  });
});

describe('fileIcon', () => {
  test('代表的な content type ごとに対応アイコンを返す', () => {
    expect(fileIcon('image/png')).toBe('🖼️');
    expect(fileIcon('application/pdf')).toBe('📄');
    expect(fileIcon('application/zip')).toBe('🗜️');
    expect(fileIcon('video/mp4')).toBe('🎬');
    expect(fileIcon('audio/mpeg')).toBe('🎵');
    expect(fileIcon('text/plain')).toBe('📝');
    expect(fileIcon('application/octet-stream')).toBe('📎');
  });
});
