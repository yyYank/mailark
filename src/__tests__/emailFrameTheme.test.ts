import { getEmailFrameStyles } from '../renderer/emailFrameTheme';

describe('getEmailFrameStyles', () => {
  test('dark テーマでは本文文字色を明るくし、リンク色も上書きする', () => {
    const result = getEmailFrameStyles('dark');

    expect(result).toContain('color:#f3f1eb');
    expect(result).toContain('a, a * { color:#8dd8ff !important; }');
  });

  test('light テーマでは白文字を強制しない', () => {
    const result = getEmailFrameStyles('light');

    expect(result).toContain('background:#ffffff');
    expect(result).not.toContain('!important');
  });
});
