# macOS / Windows 配布準備メモ

`mailark` を配布用に整えるための最短手順メモ。
対象は `macOS` と `Windows` のみ。

## 方針

- `macOS` は `Apple Developer Program` に加入し、`Developer ID` 署名 + `notarization` を行う
- `Windows` は `Authenticode` 署名を行い、`SmartScreen` 警告を減らす
- どちらも最終的には `electron-builder` と GitHub Actions に組み込む

## macOS

### 1. Apple 側の準備

1. Apple Account で 2FA を有効化する
2. `Apple Developer Program` に加入する
3. 個人登録なら、Apple Developer アプリから進めるのが最短
4. 有効化後、`Developer ID Application` 証明書を作成する

### 2. ローカルでやること

1. 証明書をキーチェーンに入れる
2. `electron-builder` 用に `mac` 設定を追加する
3. `hardenedRuntime: true` を有効化する
4. `entitlements.mac.plist` と `entitlements.mac.inherit.plist` を追加する
5. notarization 用の処理を `afterSign` か専用スクリプトで追加する

### 3. `electron-builder` で必要になる項目

- `build.mac.hardenedRuntime`
- `build.mac.entitlements`
- `build.mac.entitlementsInherit`
- `build.mac.identity`

必要に応じて:

- `build.mac.icon`
- `build.afterSign`

### 4. GitHub Secrets

- `APPLE_ID`
  notarization に使う Apple ID
- `APPLE_APP_SPECIFIC_PASSWORD`
  app-specific password を使う場合
- `APPLE_TEAM_ID`
  Team ID
- `CSC_LINK`
  証明書の `.p12` を base64 などで渡す場合
- `CSC_KEY_PASSWORD`
  `.p12` のパスワード

注記:

- 最近は `notarytool` + App Store Connect API Key 構成もある
- その場合は `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` 形式に寄せる

### 5. 完了条件

- `dmg` をダウンロードしても `Apple は検証できませんでした` が出にくい
- `spctl --assess -vv mailark.app` で notarized 済みとして評価される

## Windows

### 1. 証明書の準備

1. `Code Signing Certificate` を取得する
2. まずは通常のコード署名証明書でも可
3. 予算が許せば `EV Code Signing` の方が SmartScreen 的には有利

### 2. ローカルでやること

1. `.pfx` 証明書を用意する
2. `electron-builder` が読める形で設定する
3. 署名付きで `nsis` インストーラをビルドする

### 3. GitHub Secrets

- `WIN_CSC_LINK`
  Windows 用 `.pfx` を base64 などで渡す場合
- `WIN_CSC_KEY_PASSWORD`
  `.pfx` のパスワード

運用によっては既存の

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

に統一してもよい

### 4. 完了条件

- `.exe` / `.nsis` が署名済みになる
- プロパティで発行元が表示される
- `SmartScreen` 警告が減る

## 実装順

1. macOS の Apple アカウント加入
2. macOS の署名 + notarization を先に通す
3. Windows のコード署名を追加する
4. GitHub Actions に組み込む
5. README / Release Notes に配布手順を反映する

## この repo で次にやること

1. `package.json` に `mac` の署名設定を追加する
2. `build/entitlements.mac.plist` を追加する
3. notarization スクリプトを追加する
4. GitHub Actions に secrets 前提の署名フローを追加する
5. Windows の署名設定を `electron-builder` に追加する

## 補足

- `macOS` は開発者アカウントがない限り根本解決できない
- `Windows` は未署名でも配布はできるが、警告が出やすい
- 優先度は `macOS > Windows`
