export interface ParsedQuery {
  from?: string;
  to?: string;
  since?: number;
  until?: number;
  text: string;
}

export function parseSearchQuery(query: string): ParsedQuery {
  const result: ParsedQuery = { text: '' };
  const remaining: string[] = [];

  for (const token of query.trim().split(/\s+/)) {
    if (!token) continue;
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const val = token.slice(colonIdx + 1);
      if (key === 'from') { result.from = val; continue; }
      if (key === 'to') { result.to = val; continue; }
      if (key === 'since') {
        const ts = parseQueryDate(val);
        if (ts !== null) { result.since = ts; continue; }
      }
      if (key === 'until') {
        const ts = parseQueryDate(val);
        if (ts !== null) { result.until = ts + 24 * 60 * 60 * 1000 - 1; continue; }
      }
    }
    remaining.push(token);
  }

  result.text = remaining.join(' ');
  return result;
}

export function parseQueryDate(str: string): number | null {
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(year, month, day);
  if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d.getTime();
}
