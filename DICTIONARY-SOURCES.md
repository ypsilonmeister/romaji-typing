# しりとり拡張辞書の出典

`public/shiritori-dict.json`（ひらがな名詞 19,991 語）は、次の2つの辞書データの
読みを突き合わせて作成した。

## JMdict
- 提供: Electronic Dictionary Research and Development Group (EDRDG)
- ライセンス: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- 利用した範囲: 常用タグ（pri）付きの名詞エントリのかな読み

## SudachiDict (core)
- 提供: Works Applications Co., Ltd.
- ライセンス: Apache License 2.0
- 利用した範囲: 普通名詞エントリの読み

## 抽出条件（2026-11-27）
- 両方に読みが存在する名詞のみ
- アプリのローマ字表で入力できるかなだけ（2〜7文字。長音「ー」を含む語も、打ち方の追加に合わせて収録）
