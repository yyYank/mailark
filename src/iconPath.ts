import * as path from 'path';

const ICON_FILE = 'mailark-square.png';

export function getAppIconPath(currentDir: string, isPackaged: boolean): string {
  const assetBaseDir = isPackaged
    ? path.resolve(currentDir, '..', '..')
    : path.resolve(currentDir, '..');

  return path.join(assetBaseDir, 'assets', ICON_FILE);
}
