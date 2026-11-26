# タイプクラフト（romaji-typing）

小学2年生の子どものためのローマ字入力れんしゅうアプリ。設計中。

画面にキーボードを表示し、次に押すキーと使う指を案内しながら、かな→ローマ字の変換そのものを遊びとして学ぶ Web アプリ。IME の変換操作なしに、アプリ側の照合で遊べる形にする。

## 開発

Node.js 22 系を使う（Vite の要件は 20.19 以上または 22.12 以上）。

```sh
npm ci
npm run dev      # 開発サーバー（表示されたURLの /romaji-typing/ を開く）
npm test         # Vitest
npm run build    # 型チェックと dist/ へのビルド
npm run preview  # ビルド結果の確認
```

`main` への push で、GitHub Actions がテストとビルドを行い、GitHub Pages に公開する。

## 設計文書

- [仕様骨格 v0.1](spec-v0.1.md) — 初期の骨格
- [仕様骨格 v0.2](spec-v0.2.md) — 決定5点の反映
- [詳細仕様 v0.3](spec-v0.3-detail.md) — ローマ字対応表・照合ルール、指の割り当てとレッスン構成、テーマ別単語パック、進捗データと画面遷移

## 前提

- 対象デバイス: MacBook Air（ChromeOS Flex）の物理キーボード、Chrome ブラウザ
- 技術構成（予定）: TypeScript + React + Vite、GitHub Pages、進捗は端末内（IndexedDB）のみ・外部送信なし
- 設計原則: 点数を目的にしない、減点なし、ドリル型の反復にしない（yubi-labo の家族の合意を継承）
