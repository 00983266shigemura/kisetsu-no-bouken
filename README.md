# きせつのぼうけん — 小学校受験向け四季クイズ
日本の季節・行事・植物・生き物などを5〜6歳児が絵を見ながら学ぶ静的Webアプリです。**100テーマ・240問、独自SVG画像103点、5問ごとのスタンプ、復習、端末内の進捗保存**を収録しています。

## 公開先
GitHub Pagesを有効にすると、通常は以下で公開されます。
https://00983266shigemura.github.io/kisetsu-no-bouken/

本番公開は有効化済みで、HTTP 200・AppCache MIMEも確認済みです（下記検証記録参照）。\n\nリポジトリの **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save** を選択してください。公開用ファイルはGitHub Actionsがmain直下に自動生成します。

## iOS 10（Safari 10.0〜10.3）で使う場合
1. Safariで公開URLを開きます。初回は通信が必要です。
2. 画面に「オフラインでも あそべるよ」と表示されるまで待ちます。
3. 共有メニューから「ホーム画面に追加」を選びます。ホーム画面から起動する場合は、その画面でも最初に通信した状態で開き、保存を完了してください。
4. 機内モードで再起動し、問題、画像、スタンプが使えることを確認してください。

**技術的な違い：** iOS 10にはService Workerがありません。Safari 10では旧式のHTML5 Application Cache（`offline.appcache`）を使用します。配信サーバーが`text/cache-manifest`で返す必要があります。iOS 11.3以降・現行ブラウザーではService Workerを使用します。iOS 10のWeb App Manifestは利用できず、AppleのWeb Appメタタグに対応します。iOS 10実機での検証は未実施です。

## 開発・ローカル起動
Node.js 22以上、Python 3を推奨。
```sh
npm install --no-save --ignore-scripts typescript@5.9.3
node build.js
node test.js
python3 -m http.server 8000
```
`http://localhost:8000/` をブラウザーで開きます。直にファイルを開くとオフラインキャッシュ動作は検証できません。

## ファイル
- `source.html`：教材・独自イラスト・クイズロジックを含む元ソース
- `build.js`：Safari 10向けES5変換と互換処理を生成するビルド
- `index.html`：GitHub Actionsで生成した公開用の自己完結版
- `offline.appcache`：iOS 10用オフラインマニフェスト
- `sw.js`：新しいブラウザー用Service Worker
- `icon.svg` / `manifest.webmanifest`：アイコン・現行PWAメタデータ
- `test.js`：旧Safariを模擬した起動・出題・進捗回帰テスト

## 保護者向けの注意事項
学習履歴は端末のlocalStorageに保存し、ネットへ送信しません。Safariの履歴・Webサイトデータ削除、プライベートモード、保存容量制限などにより消える場合があります。iOS 10の日本語読み上げ音声は端末依存で、音声がない場合は文字と絵で利用してください。アカウント登録、広告、課金、ランキングはありません。

教材の時期は日本の一般的な四季区分によります。花期や旬には地域・年差があります。出典39件はアプリ内のデータ・保護者向け表示で確認できます。第三者の教材や過去問の転載ではありません。

## GitHub Pagesの本番配信確認（2026-10-09）
GitHub Actionsの本番HTTP検証で、公開URL `https://00983266shigemura.github.io/kisetsu-no-bouken/` の **HTTP 200** を実測しました。`offline.appcache` は **Content-Type: text/cache-manifest** で配信され、Service Worker・SVGアイコン・Web App Manifestも公開URLから取得できました。検証記録：[Verify published app and iOS 10 offline support](https://github.com/00983266shigemura/kisetsu-no-bouken/actions/runs/37892278610)。**iOS 10.3.3実機でのオフライン再起動は未実施**です。
