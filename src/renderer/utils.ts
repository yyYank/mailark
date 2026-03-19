export function formatDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function highlight(text: string, query: string): string {
  if (!query) return escHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<span class="highlight">$1</span>');
}

export function fileIcon(ct: string): string {
  if (ct.includes('image')) return '🖼️';
  if (ct.includes('pdf')) return '📄';
  if (ct.includes('zip') || ct.includes('compressed')) return '🗜️';
  if (ct.includes('video')) return '🎬';
  if (ct.includes('audio')) return '🎵';
  if (ct.includes('text')) return '📝';
  return '📎';
}
