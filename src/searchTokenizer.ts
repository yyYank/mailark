import { KuromojiToken, tokenize } from 'kuromojin';

const STOP_POS = new Set(['記号', '助詞', '助動詞']);

export async function tokenizeJapaneseText(text: string): Promise<string[]> {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];

  try {
    const tokens = await tokenize(normalized);
    return flattenKuromojiTokens(tokens);
  } catch (err) {
    // kuromoji の辞書ロード失敗などはサイレントに埋もれないようログに残す
    console.error('[searchTokenizer] kuromoji tokenize failed, falling back to space split:', err);
    return normalized.split(' ').filter(Boolean);
  }
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[_/\\|()[\]{}<>"'`~!@#$%^&*=+?,.:;-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenKuromojiTokens(tokens: Readonly<Readonly<KuromojiToken>[]>): string[] {
  const terms: string[] = [];

  for (const token of tokens) {
    if (STOP_POS.has(token.pos)) continue;

    const surface = normalizeSearchText(token.surface_form);
    if (surface) terms.push(surface);

    const basic = normalizeSearchText(token.basic_form);
    if (basic && basic !== '*' && basic !== surface) {
      terms.push(basic);
    }
  }

  return terms;
}
