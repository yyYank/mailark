import { getStoredTheme, nextTheme } from '../renderer/theme';

describe('getStoredTheme', () => {
  test('light が保存されていれば light を返す', () => {
    const storage = { getItem: jest.fn(() => 'light') };

    expect(getStoredTheme(storage)).toBe('light');
  });

  test('dark が保存されていれば dark を返す', () => {
    const storage = { getItem: jest.fn(() => 'dark') };

    expect(getStoredTheme(storage)).toBe('dark');
  });

  test('不正な値や未保存時は dark を返す', () => {
    expect(getStoredTheme({ getItem: jest.fn(() => 'sepia') })).toBe('dark');
    expect(getStoredTheme({ getItem: jest.fn(() => null) })).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });
});

describe('nextTheme', () => {
  test('dark から light へ切り替わる', () => {
    expect(nextTheme('dark')).toBe('light');
  });

  test('light から dark へ切り替わる', () => {
    expect(nextTheme('light')).toBe('dark');
  });
});
