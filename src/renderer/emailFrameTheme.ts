import { ThemeMode } from './theme';

export function getEmailFrameStyles(theme: ThemeMode): string {
  if (theme === 'dark') {
    return [
      'body { background:#17171a; color:#f3f1eb; }',
      'body, body * { color:#f3f1eb !important; }',
      'a, a * { color:#8dd8ff !important; }',
      'blockquote { border-color:#4b5563 !important; }',
      'hr { border-color:#3a3a42 !important; }',
    ].join(' ');
  }

  return [
    'body { background:#ffffff; color:#111111; }',
    'a { color:#0b57d0; }',
  ].join(' ');
}
