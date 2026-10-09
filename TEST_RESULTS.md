# テスト結果（2026-10-09）

## GitHub Actions・自動回帰テスト：合格
- TypeScriptによるES5出力の自動ビルド
- 旧Safari想定でObject.values/entries/fromEntries、Array.includes、String.padStartを無効にして起動し、互換ポリフィルを確認
- 100テーマ、240問、39件の参考資料、103点のローカル画像参照、検証ロジックでの正解整合
- 5問の出題・回答・採点・終了・スタンプ保存・間違えた問題の復習予約
- モーダル、地図、図鑑、localStorage再起動後の進捗保持
- Service Workerがない環境でのAppCache初期化処理
- GitHub Actionsのビルド成功・テスト成功、生成ファイルのGitHub上でのreadback

## GitHub Pages公開確認（合格）
公開URLのHTTP 200、`offline.appcache` の `Content-Type: text/cache-manifest`、`sw.js`・`icon.svg`・`manifest.webmanifest` の取得をGitHub-hosted runnerで確認。検証実行：https://github.com/00983266shigemura/kisetsu-no-bouken/actions/runs/37892278610

## 未確認・未合格扱い
- iOS 10実機Safariでのタップ・画面崩れ・読み上げ・機内モード再起動
- Android Chromeおよび現行iPhone Safariの実機検証
- 全画像を人間が個別に鑑定した正確性、個別学校の出題との一致

検証手順：`npm install --no-save typescript@5.9.3 && node build.js && node test.js`。本番確認前に「全プラットフォーム動作確認済み」とは表記しません。

## GitHub Pagesの本番配信確認（2026-10-09）
GitHub Actionsの本番HTTP検証で、公開URL `https://00983266shigemura.github.io/kisetsu-no-bouken/` の **HTTP 200** を実測しました。`offline.appcache` は **Content-Type: text/cache-manifest** で配信され、Service Worker・SVGアイコン・Web App Manifestも公開URLから取得できました。検証記録：[Verify published app and iOS 10 offline support](https://github.com/00983266shigemura/kisetsu-no-bouken/actions/runs/37892278610)。**iOS 10.3.3実機でのオフライン再起動は未実施**です。
