const MAX_SEARCHABLE_BODY_LENGTH = 2000;
const LONG_BINARYISH_RUN = /\b[A-Za-z0-9+/=]{80,}\b/g;

export function extractSearchableBody(body: string, htmlBody: string): string {
  const source = body.trim() ? body : htmlBody
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');

  return source
    .replace(LONG_BINARYISH_RUN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCHABLE_BODY_LENGTH);
}
