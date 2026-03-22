export function shouldSubmitSearch(key: string, isComposing: boolean): boolean {
  return key === 'Enter' && !isComposing;
}
