# Acceptance Contract — v2.4 FINAL

対象: 00983266shigemura/kisetsu-no-bouken。公開: main / (root)。
基準 main: 8ed8487dcc6585e51ba0385be2554793aec71904。
制作ブランチ: asset-refresh-20261009、基準: bf2ffcc2cc07a2919ae745b22c5f0dc218f11b9b。

各条件は証拠の対象コミット/リリースIDを記録して判定する。下表の初期判定は全てUNVERIFIED。
証拠なし・古い版の成功はPASSにしない。FAIL/UNVERIFIEDの必須条件は正式リリースを阻止する。
公開後の条件は公開前に検査手段を準備し、公開後のreadback完了まで全体完了としない。失敗時は旧正常版を保護・復旧する。
画像進捗の唯一の正本は asset-refresh/manifest.json。ここでは個別画像の進捗を重複管理しない。

| ID | 必須受入条件 | 検証方法 | 証拠保存先 | 初期判定 |
|---|---|---|---|---|
| A01 | 100テーマ、240問、ID・順序・正答・季節・月・解説・出典保持 | 基準スナップショットと構造比較 | quality/evidence/data-baseline.json, data-comparison.json | UNVERIFIED |
| A02 | 540画像参照・既存画像ID保持 | 全HTML/CSS/JS参照と辞書を抽出・比較 | quality/evidence/image-references.json | UNVERIFIED |
| A03 | 103画像を新規AI生成、画像保存・再取得ハッシュ一致 | 制作台帳とGitHub実体照合、実デコード・寸法・容量検査 | asset-refresh/manifest.json, quality/evidence/image-readback.json | UNVERIFIED |
| A04 | 教育的・科学的・文化的正確性と視覚品質 | 対象固有特徴と信頼できる出典照合、視覚QAを独立記録 | asset-refresh/manifest.json, quality/evidence/contact-sheet.jpg | UNVERIFIED |
| A05 | iOS 10.3.3互換 V1 | ES5構文、形式、ハッシュ、全資産列挙・MIME検査 | quality/evidence/v1.json | UNVERIFIED |
| A06 | 現代ブラウザー・模擬検証 V2 | クイズ・スタンプ・復習・SW更新・AppCache状態遷移試験 | quality/evidence/v2.json | UNVERIFIED |
| A07 | iOS 10.3.3実機 V3、L1/L2/L3 | 初回全キャッシュ、終了→機内モード再起動、画像・問題・進捗、旧→新更新、再オフライン起動、失敗時旧版保持 | quality/evidence/v3.json | UNVERIFIED |
| A08 | スタンプ・復習・localStorageキー/形式/保存データ保持 | 基準データを使った旧版→新版読込と保存比較 | quality/evidence/storage-regression.json | UNVERIFIED |
| A09 | CI安全化・main保護強制力 | 読取専用CI、PR必須・必須 app-ci-build（GitHub Actions実行元固定）、直接更新/失敗CIの拒否、bypassなし、正常PRマージ確認 | Actions run、quality/evidence/protection.json | UNVERIFIED |
| A10 | 決定的ビルドと自己参照なしのrelease ID | 正本パス+内容hashを整列、依存固定、生成物を除外し独立2回バイト比較 | quality/evidence/reproducibility.json, release.json | UNVERIFIED |
| A11 | 公開URLと対象リリースID一致 | 正式デプロイ後release.jsonと全資産hash/MIME/画像実デコード照合 | quality/evidence/public-readback.json | UNVERIFIED |
| A12 | 公開後の実動作と新旧混在なし | ブラウザーでクイズ・スタンプ・復習・保存・更新回帰 | quality/evidence/public-browser.json | UNVERIFIED |
| A13 | 公開可能情報のみ | 配信可能な全ファイル・画像metadata・生成物の秘密/家庭固有情報検査と内容確認 | quality/evidence/public-safety.json | UNVERIFIED |
| A14 | GitHubから再開可能 | 画像・台帳・hashを再取得し、合格画像を再生成せず再利用 | quality/evidence/resume.json | UNVERIFIED |

V1〜V3は検証層、L1〜L3はオフライン要件であり別管理する。V2でV3を代替しない。
V3のみはユーザーの明示的例外承認があれば未検証を明示した暫定公開を許容する。V3の判定自体はUNVERIFIEDのまま保持。

## Gate 0 / 変更管理

CI専用PRは安全化のため先行マージ可能。アプリの配信ファイルは変更しない。
保護設定候補 KISETSU-RULESET-20261009-01 は明示承認後のみwrite。
main限定、active、PR必須、必須チェック app-ci-build（GitHub Actions、integration_id=15368）の実行元固定、force push/削除禁止、管理者bypassなし。
未承認・強制力未検証なら本番更新と画像大量生成を停止。安全なコード準備と検証は継続可能。
既存制作ブランチはCI安全化後に非破壊merge。103レコード・ID・status・基準コミットを比較。
新しい指摘は既存契約の欠陥修正か新規変更要求かを識別し、影響範囲を査読してから対応する。

## CIの根拠・限界

GitHub公式: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
GitHub公式: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
最小権限・PR/push両方・パスフィルターなし・checkout資格情報非保持を採用。
現build.jsはcwdへindex.html/sw.js/offline.appcacheを出力するため、独立した一時ディレクトリに正本をコピーし生成物を事前に持ち込まず比較する。
CI単独では保護ルール強制力、実機動作、教材正確性は証明しない。
