# iOS 10互換性の調査と設計（2026-10-09）
## 一次資料に基づく結論
- WebKit「Workers at Your Service」(2018): Service WorkerのiOS対応は**11.3**から。https://webkit.org/blog/8090/workers-at-your-service/
- WebKit「New Web Features in Safari 10.1」(2017): fetch・Array.includes・Object.values / Object.entries・async/await等はSafari 10.1で追加。**iOS 10.0を下限**とし、ES5へダウンレベル変換し一部APIをポリフィル。https://webkit.org/blog/7477/new-web-features-in-safari-10-1/
- Apple「HTML5 Offline Application Cache」: iOS SafariでApplication Cacheを利用可能、`text/cache-manifest` MIME必須、初回はオンライン、Manifestが変わらなければキャッシュの更新が発火しない。https://developer.apple.com/library/archive/documentation/iPhone/Conceptual/SafariJSDatabaseGuide/OfflineApplicationCache/OfflineApplicationCache.html
- Apple「Storing Data on the Client」: Web Appのローカル保存とAppCacheのオフライン動作。https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/Client-SideStorage/Client-SideStorage.html
- GitHub Pagesからの公開HTTPヘッダーを実測： `.appcache` は `Content-Type: text/cache-manifest` で配信。https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## 対応方法
1. バンドル内のJSをTypeScriptコンパイラのtarget ES5で変換。
2. Object.values/entries/fromEntries、Array.includes、String.padStart等のポリフィル。
3. HTMLDialogElement非対応時に旧DOMでダイアログ実装。
4. CSS Grid非対応ブラウザーにはFlexboxレイアウトの代替。
5. 旧Safari：AppCache。新しいSafari/Android：Service Worker。HTMLと103 SVGは内部保存し、実行時に外部通信不要。
6. localStorageの保存に失敗した場合は警告を表示。端末ごとの音声利用可否を尊重。
7. AppCacheマニフェスト内でハッシュ値を更新し、変更時に再キャッシュを促す。

## 残る環境依存の検証
iOS 10搭載実機Safariの表示・音声・ホーム画面起動・機内モード再起動、GitHub Pagesの`offline.appcache` HTTP MIMEヘッダーは実環境で検証する必要があります。Node模擬環境での成功は実機の互換性保証ではありません。

## GitHub Pagesの本番配信確認（2026-10-09）
GitHub Actionsの本番HTTP検証で、公開URL `https://00983266shigemura.github.io/kisetsu-no-bouken/` の **HTTP 200** を実測しました。`offline.appcache` は **Content-Type: text/cache-manifest** で配信され、Service Worker・SVGアイコン・Web App Manifestも公開URLから取得できました。検証記録：[Verify published app and iOS 10 offline support](https://github.com/00983266shigemura/kisetsu-no-bouken/actions/runs/37892278610)。**iOS 10.3.3実機でのオフライン再起動は未実施**です。
