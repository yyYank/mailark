# mailark

メールアーカイブ・メッセージダンプのデスクトップビューアー  
A desktop viewer for email archives and message dumps.

Thunderbirdなどのメールクライアントに頼らず、アーカイブファイルを開いて検索・閲覧できます。  
Browse, search, and sort through mail archives and exported message data — without fighting your email client.

---

## 対応フォーマット / Supported Formats

| フォーマット | 状態 |
|------------|------|
| mbox | ✅ 対応済み |
| PST (Outlook) | 🚧 開発予定 |
| Google Chat ダンプ | 🚧 開発予定 |
| EML | 🚧 開発予定 |

---

## 機能 / Features

- 📂 mboxファイルを開いて2ペインでメール一覧表示
- 🔍 差出人・件名・本文の横断フルテキスト検索
- ↕️ 日付でのソート
- 📎 添付ファイルの確認・展開
- 🌐 HTMLメールのサンドボックス表示
- 🔣 RFC2047エンコードされた件名（日本語など）のデコード対応

---

## セットアップ / Getting Started

**必要なもの / Prerequisites:** Node.js 18+

```bash
git clone https://github.com/yourname/mailark.git
cd mailark
npm install
npm start
```

---

## 使い方 / Usage

1. `npm start` でアプリを起動
2. 右上の **「mboxを開く」** をクリック
3. mboxファイルを選択（拡張子なしファイルも可）
4. 左ペインのメール一覧からクリックして本文を表示
5. 上部の検索バーで差出人・件名・本文を絞り込み
6. 添付ファイルはチップをクリックで展開

### Thunderbirdのmboxファイルの場所

```
~/Library/Thunderbird/Profiles/xxxxxxxx.default/Mail/
```

---

## ロードマップ / Roadmap

- [ ] PST形式の対応
- [ ] Google Chat JSONダンプの対応
- [ ] EML形式の対応
- [ ] 差出人・件名でのソート
- [ ] メール単体のエクスポート
- [ ] ダーク / ライトテーマの切り替え

---

## コントリビュート / Contributing

PRはいつでも歓迎です。大きな変更は先にissueを立ててください。  
PRs welcome. Please open an issue first for large changes.

## ライセンス / License

MIT
