export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'mailark-theme';

interface StorageLike {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export function getStoredTheme(storage?: StorageLike): ThemeMode {
  const value = storage?.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'dark';
}

export function saveTheme(theme: ThemeMode, storage?: StorageLike): void {
  storage?.setItem?.(STORAGE_KEY, theme);
}

export function nextTheme(theme: ThemeMode): ThemeMode {
  return theme === 'dark' ? 'light' : 'dark';
}

export function applyTheme(theme: ThemeMode, body?: { dataset: Record<string, string | undefined> } | null): void {
  if (!body) return;
  body.dataset.theme = theme;
}
