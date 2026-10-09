# テスト結果（2026-10-09）

## GitHub Actions・自動回帰テスト：合格
- TypeScriptによるES5出力の自動ビルド
- 旧Safari想定でObject.values/entries/fromEntries、Array.includes、String.padStartを無効にして起動し、互換ポリフィルを確認
- 100テーマ、240問、39件の参考資料、103点のローカル画像参照、検証ロジックでの正解整合
- 5問の出題・回答・採点・終了・スタンプ保存・間違えた問題の復習予約
- モーダル、地図、図鑑、localStorage再起動後の進捗保持
- Service Workerがない環境でのAppCache初期化処理
- GitHub Actionsのビルド成功・テスト成功、生成ファイルのGitHub上でのreadback

## 未確認・未合格扱い
- iOS 10実機Safariでのタップ・画面崩れ・読み上げ・機内モード再起動
- GitHub Pagesの稼働URLおよびAppCacheファイルのHTTP Content-Type実測
- Android Chromeおよび現行iPhone Safariの実機検証
- 全画像を人間が個別に鑑定した正確性、個別学校の出題との一致

検証手順：`npm install --no-save typescript@5.9.3 && node build.js && node test.js`。本番確認前に「全プラットフォーム動作確認済み」とは表記しません。
