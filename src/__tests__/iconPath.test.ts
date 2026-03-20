import * as path from 'path';
import { getAppIconPath } from '../iconPath';

describe('getAppIconPath', () => {
  test('開発環境ではプロジェクト直下のassets画像を返す', () => {
    const result = getAppIconPath('/workspace/project/dist', false);

    expect(result).toBe(path.join('/workspace/project', 'assets', 'mailark-square.png'));
  });

  test('パッケージ環境ではResources配下のassets画像を返す', () => {
    const result = getAppIconPath('/Applications/mailark.app/Contents/Resources/app.asar/dist', true);

    expect(result).toBe(path.join('/Applications/mailark.app/Contents/Resources/app.asar', 'assets', 'mailark-square.png'));
  });
});
