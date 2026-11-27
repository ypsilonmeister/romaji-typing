# ローマ字入力れんしゅうアプリ 詳細仕様 v0.3

状態: 仕様骨格 v0.2 の詳細化。決定5点（§10 of v0.2）を前提とする。
この文書が定めるもの: ローマ字対応表と照合ルール（§1〜§2）、指の割り当てとレッスン構成（§3〜§4）、テーマ別単語パック（§5）、進捗データと画面遷移（§6〜§7）。

## 1. ローマ字対応表

案内表示に使う「推奨綴り」と、正解として受け入れる「許容綴り」を分けて持つ。許容綴りは IME（MS-IME / Google 日本語入力）の受理範囲に準ずる。

> 注記（2026-11-26 確定）: ぢ・づ・ぢゃ行の推奨綴りは IME の実際の打ち方に合わせて `di` / `du` / `dya` / `dyu` / `dyo` とする（従来の `ji` / `zu` / `ja` / `ju` / `jo` は許容綴りとして残す）。これにより、実装時の仕様確認で判断待ちだった ぢ・づ・ぢゃ行の扱いは解消された。

### 1.1 清音

| かな | 推奨 | 許容 |
|---|---|---|
| あ い う え お | a i u e o | |
| か き く け こ | ka ki ku ke ko | |
| さ し す せ そ | sa **shi** su se so | し=si |
| た ち つ て と | ta **chi tsu** te to | ち=ti、つ=tu |
| な に ぬ ね の | na ni nu ne no | |
| は ひ ふ へ ほ | ha hi **fu** he ho | ふ=hu |
| ま み む め も | ma mi mu me mo | |
| や ゆ よ | ya yu yo | |
| ら り る れ ろ | ra ri ru re ro | |
| わ を | wa **wo** | （をは wo のみ。o は「お」になるため不可） |
| ん | **nn** | n（確定条件は §2.3） |

### 1.2 濁点・半濁点

| かな | 推奨 | 許容 |
|---|---|---|
| が ぎ ぐ げ ご | ga gi gu ge go | |
| ざ じ ず ぜ ぞ | za **ji** zu ze zo | じ=zi |
| だ ぢ づ で ど | da **di du** de do | ぢ=ji、づ=zu |
| ば び ぶ べ ぼ | ba bi bu be bo | |
| ぱ ぴ ぷ ぺ ぽ | pa pi pu pe po | |

### 1.3 拗音

| かな | 推奨 | 許容 |
|---|---|---|
| きゃ きゅ きょ | kya kyu kyo | |
| しゃ しゅ しょ | **sha shu sho** | sya syu syo |
| ちゃ ちゅ ちょ | **cha chu cho** | tya tyu tyo、cya cyu cyo |
| にゃ にゅ にょ | nya nyu nyo | |
| ひゃ ひゅ ひょ | hya hyu hyo | |
| みゃ みゅ みょ | mya myu myo | |
| りゃ りゅ りょ | rya ryu ryo | |
| ぎゃ ぎゅ ぎょ | gya gyu gyo | |
| じゃ じゅ じょ | **ja ju jo** | jya jyu jyo、zya zyu zyo |
| ぢゃ ぢゅ ぢょ | **dya dyu dyo** | ja ju jo |
| びゃ びゅ びょ | bya byu byo | |
| ぴゃ ぴゅ ぴょ | pya pyu pyo | |

### 1.4 特殊

- 促音（っ）: 次の子音を重ねる（かっこ=kakko、ずっと=zutto、しっかり=shikkari）。子音の前の単独入力として xtu / ltu も許容する（IME 準拠、案内には出さない）。
- 小さい ゃゅょ の単独入力: xya / lyu 等の x・l 接頭辞を許容する（案内には出さない）。
- 推奨の打ち方がない場合（子音を重ねられない位置の促音＝語末や母音・な行・ん の前など、および単独の小さい ゃゅょ）: x・l の入力は受け付けるが、打ち始める前は案内するキーを出さない。x・l で打ち始めた後は、§2.2 に従って案内が追従する。
- 長音（ー）: 1単位として扱い、推奨綴りを `-`（IME と同じキー）とする。許容綴りは持たない。促音の子音重ねの対象にはしない。

## 2. 照合ルール（マッチャ）

### 2.1 基本方式
- お題（1文字または単語）をかな列に分解し、各かなに受理綴りの集合を持たせる。
- 入力キーを1文字ずつ受け、現在のかなの受理集合のうち「入力済み接頭辞と矛盾しない綴り」だけを候補として残す。いずれかの綴りが完結したら、そのかなが完成し次のかなへ進む。
- 単語全体でも同じ照合を連結して行う（かな境界をまたぐ曖昧さは §2.3 で処理する）。

### 2.2 案内の追従
- 次に押すキーの案内は、原則として推奨綴りに沿って表示する。
- ただし学習者が別綴りで打ち始めた場合（例: ち を t と打ち始めた）、案内はその綴りに追従して切り替える（次のキーは I を光らせる）。打ち方を途中で否定しない。
- 打ったキーが推奨綴りと別綴りで共通の間（例: し の s）は、どちらか決まらないので推奨綴りの次のキー（H）を案内する。別綴りの次のキー（I）も受け付け、打てばその綴りになる。
- 長音（ー）の案内では `-` キー（バーチャルキーボードの「ー」ボタン、担当指は右小指）を光らせて示す。ヒント表示にも「ー (-)」のように `-` キーであることを示す。

### 2.3 「ん」の確定条件
- 次のかなが母音・や行・ら行・わ行の場合: nn を要求する（かに vs かんい、きんよう vs きにょう の区別）。
- 次のかなが な行（にゃ・にゅ・にょ を含む）・ん の場合も nn を要求する。n 1つでは次の n と区別できず、IME では nn が「ん」1文字になるため（おんな=onnna。onna は IME では「おんあ」になる）。
- 次のかなが上記以外の場合、および語末: n 1つで確定してよい。語末を n 1つで確定した直後の余分な n 1つは、入力にもミスにも数えず受け流す。
- 実装は単語単位で先読みして判定する。単独1文字のお題で「ん」を出す場合は nn を正とする。

### 2.4 間違いキーと戻る操作
- 候補綴りの次の文字に合わないキーは受け付けない。小さな揺れと音で知らせ、正しいキーを光らせる。減点・記録上のペナルティは付けない（詰まりの検出用に内部カウントだけ持つ）。
- Backspace は「入力中のかな」の範囲でのみ有効。完成したかなには戻れない（IME の確定に近い体験と、詰まり防止のため）。
- ヒント: 一定時間（目安5秒）入力が止まったら、次のキーを自動で光らせる。手動のヒントボタンも置く。

## 3. 指の割り当て

標準的なタッチタイピングの割り当てを使う。

| 指 | キー |
|---|---|
| 左・小指 | Q A Z |
| 左・薬指 | W S X |
| 左・中指 | E D C |
| 左・人差し指 | R F V / T G B |
| 右・人差し指 | Y H N / U J M |
| 右・中指 | I K , |
| 右・薬指 | O L . |
| 右・小指 | P ; / |
| 親指 | スペース（右親指を基本とする） |

- ホームポジション: 左手 ASDF、右手 JKL;。F と J の突起を触って確かめることを、初回案内に入れる。
- 指の色（全画面共通で固定）: 小指=ピンク、薬指=みどり、中指=あお、人差し指=きいろ、親指=オレンジ。左右は手の図の形で示す（色は左右共通）。
- バーチャルキーボードのキーは担当指の色で縁取り、手の図では使う指が光る。

## 4. レッスン構成

### 4.1 二つの軸
- キー解放ステージ（Stage A〜E）: どの文字キーが使えるか。指の担当順に解放する。
- かな種別: 清音 → 特殊（濁点・拗音・促音・ん）。§1 の表の順。
- レッスンは2軸の組み合わせで構成する。新しいキー・新しいかなは「案内あり」で導入し、既習のものは「案内なし」で混ぜて出す（スパイラル方式）。これにより反復ドリル化を避ける。

### 4.2 ステージ定義と導入かな

かなは「その綴りの全文字が解放済みキーに含まれるもの」だけが導入できる。

**Stage A — ホームポジション**
- 新規キー: A S D F G H J K L（ホーム段）
- 導入かな: あ か さ だ が は
- 例: あさ、かさ、はは、さか、あか

**Stage B — 中指の上段**
- 新規キー: E I
- 導入かな: い え き し ひ ぎ じ で け せ へ げ
- 例: いえ、かい、しか、せかい、はし、えき、けしき、かげ

**Stage C — 人差し指の上段**
- 新規キー: R T Y U
- 導入かな: う た て つ ら り る れ ふ す く や ゆ
- 例: つき、ゆき、すし、すいか、さくら、からす、ふゆ、はる、りす、うた、てら

**Stage D — 薬指・小指の上段**
- 新規キー: W O Q P
- 導入かな: お こ そ と よ ろ わ を ほ ぽ ご ど
- 例: そら、ほし、とり、ことり、ことりこ、よる、わに、おと

**Stage E — 下段すべて**
- 新規キー: Z X C V B N M
- 導入かな: な に ぬ ね の ま み む め も ち ざ ず ぜ ぞ ば び ぶ べ ぼ ん
- 例: ねこ、いぬ、うま、かに、えび、ざりがに、でんしゃ、ふみきり

特殊な綴り（濁点・拗音・促音・ん）は、各ステージの文字範囲が揃った時点で、その範囲で作れるものから順に導入する。例: Stage B までで ぎ・じ・げ（濁点の一部）は導入済み。拗音は しゃ（Stage B）→ きゃ・ちゃ（Stage E で c 解放後）など。

### 4.3 レッスンの単位と長さ
- 1レッスン = お題 8〜12個（1文字または短い単語）。目安3〜5分。
- 解放条件: そのレッスンの新しい要素を、案内ありで一通り打てたら次へ進める。案内なしの習熟は、その後のレッスンに混ざって自然に判定する（§6 の定着度）。
- テーマ別単語（§5）は、モード選択の「テーマで あそぶ」および各テーマ選択から、到達ステージにかかわらず初回から全語をキー案内付きで遊べる（ステージ進捗による絞り込みは行わない）。

## 5. テーマ別単語パック（14テーマ・537語）

Step 4「ことば」用。語はひらがな表記（長音「ー」を含む語も対象）とし、ローマ字は推奨綴り（長音は `-`）で書く。
各パックの単語は、到達ステージにかかわらず初回からキー案内付きでレッスンに出る（§4.3）。
かなの重複はテーマをまたいでも持たない（`wordId = かな` のため）。

### 5.1 宇宙
ほし(hoshi)、つき(tsuki)、たいよう(taiyou)、ちきゅう(chikyuu)、かせい(kasei)、きんせい(kinsei)、すいせい(suisei)、もくせい(mokusei)、どせい(dosei)、わくせい(wakusei)、うちゅう(uchuu)、ぎんが(ginga)、せいざ(seiza)、ながれぼし(nagareboshi)、いんせき(inseki)、えいせい(eisei)、じゅうりょく(juuryoku)、あまのがわ(amanogawa)、ほしぞら(hoshizora)、つきよ(tsukiyo)、そら(sora)、よる(yoru)、ひかり(hikari)、かげ(kage)、だーくまたー(da-kumata-)、ぶらっくほーる(burakkuho-ru)、にゅーとりの(nyu-torino)、てんのうせい(tennnousei)、かいおうせい(kaiousei)、めいおうせい(meiousei)、ぼうえんきょう(bouenkyou)、むげん(mugen)、うず(uzu)、うずまき(uzumaki)、はんぶん(hanbun)、くうき(kuuki)、うちゅうせん(uchuusen)

### 5.2 植物
はな(hana)、はっぱ(happa)、はなびら(hanabira)、き(ki)、たね(tane)、め(me)、ねっこ(nekko)、くさ(kusa)、もり(mori)、はやし(hayashi)、さくら(sakura)、たんぽぽ(tanpopo)、ひまわり(himawari)、あさがお(asagao)、すみれ(sumire)、もみじ(momiji)、いちょう(ichou)、まつ(matsu)、たけ(take)、うめ(ume)、ふじ(fuji)、かえで(kaede)、どんぐり(donguri)、わかば(wakaba)、つぼみ(tsubomi)、ふていが(futeiga)、まつぼっくり(matsubokkuri)、すぎ(sugi)、けやき(keyaki)、つばき(tsubaki)

### 5.3 地理
やま(yama)、かわ(kawa)、うみ(umi)、しま(shima)、みずうみ(mizuumi)、さばく(sabaku)、たに(tani)、ぬま(numa)、いけ(ike)、すな(suna)、なみ(nami)、みなと(minato)、はんとう(hantou)、かざん(kazan)、たき(taki)、どうくつ(doukutsu)、こうげん(kougen)、へいや(heiya)、がけ(gake)、すなはま(sunahama)、ちず(chizu)、さわ(sawa)、おーすとらりあ(o-sutoraria)、ほっかいどう(hokkaidou)、あおもり(aomori)、いわて(iwate)、みやぎ(miyagi)、あきた(akita)、やまがた(yamagata)、ふくしま(fukushima)、いばらき(ibaraki)、とちぎ(tochigi)、ぐんま(gunma)、さいたま(saitama)、ちば(chiba)、かながわ(kanagawa)、にいがた(niigata)、とやま(toyama)、いしかわ(ishikawa)、ふくい(fukui)、やまなし(yamanashi)、ぎふ(gifu)、しずおか(shizuoka)、あいち(aichi)、みえ(mie)、しが(shiga)、ひょうご(hyougo)、なら(nara)、わかやま(wakayama)、とっとり(tottori)、しまね(shimane)、おかやま(okayama)、ひろしま(hiroshima)、やまぐち(yamaguchi)、とくしま(tokushima)、かがわ(kagawa)、えひめ(ehime)、こうち(kouchi)、ふくおか(fukuoka)、さが(saga)、ながさき(nagasaki)、くまもと(kumamoto)、おおいた(ooita)、みやざき(miyazaki)、かごしま(kagoshima)、おきなわ(okinawa)、あめりか(amerika)、いぎりす(igirisu)、ふらんす(furansu)、どいつ(doitsu)、いたりあ(itaria)、すぺいん(supein)、おらんだ(oranda)、すいす(suisu)、ぎりしゃ(girisha)、とるこ(toruko)、かんこく(kankoku)、ちゅうごく(chuugoku)、ろしあ(roshia)、いんど(indo)、いらん(iran)、たい(tai)、べとなむ(betonamu)、えじぷと(ejiputo)、けにあ(kenia)、ぶらじる(burajiru)、かなだ(kanada)、めきしこ(mekishiko)、あるぜんちん(aruzenchin)、ちり(chiri)、さうじあらびあ(saujiarabia)、みなみあふりか(minamiafurika)、とうきょう(toukyou)、おおさか(oosaka)、きょうと(kyouto)、ながの(nagano)、しんしゅう(shinshuu)、にほん(nihon)、せかい(sekai)、くに(kuni)、まち(machi)、むら(mura)、とおり(toori)、みち(michi)

### 5.4 建築
いえ(ie)、うち(uchi)、たてもの(tatemono)、はしら(hashira)、かべ(kabe)、やね(yane)、まど(mado)、とびら(tobira)、かいだん(kaidan)、げんかん(genkan)、にわ(niwa)、もん(mon)、てら(tera)、じんじゃ(jinja)、しろ(shiro)、とう(tou)、はし(hashi)、えき(eki)、みせ(mise)、がっこう(gakkou)、こうえん(kouen)、へい(hei)、さっかー(sakka-)、けんちく(kenchiku)、じっけん(jikken)、びょういん(byouin)、としょかん(toshokan)、びじゅつかん(bijutsukan)、すいぞくかん(suizokukan)、どうぶつえん(doubutsuen)、ゆうえんち(yuuenchi)、こんびに(konbini)、ぱんや(pannya)、はなや(hanaya)、ほんや(honnya)、くすりや(kusuriya)、ゆうびんきょく(yuubinkyoku)、こうばん(kouban)、しょうぼうしょ(shoubousho)、けいさつしょ(keisatsusho)

### 5.5 食べ物
ごはん(gohan)、みそしる(misoshiru)、さかな(sakana)、たまご(tamago)、やさい(yasai)、くだもの(kudamono)、りんご(ringo)、みかん(mikan)、すいか(suika)、もも(momo)、ぶどう(budou)、いちご(ichigo)、なし(nashi)、かき(kaki)、さくらんぼ(sakuranbo)、ぎゅうにゅう(gyuunyuu)、うどん(udon)、そば(soba)、すし(sushi)、みそ(miso)、しょうゆ(shouyu)、さとう(satou)、しお(shio)、えび(ebi)、けーき(ke-ki)、ぱん(pan)、おにぎり(onigiri)、てんぷら(tenpura)、やきそば(yakisoba)、たこやき(takoyaki)、おこのみやき(okonomiyaki)、ぷりん(purin)、あいす(aisu)、せんべい(senbei)、だんご(dango)、もち(mochi)、とうふ(toufu)、なっとう(nattou)、にく(niku)、とりにく(toriniku)、ぎゅうにく(gyuuniku)、ぶたにく(butaniku)、やきざかな(yakizakana)、さしみ(sashimi)、おちゃ(ocha)、むぎちゃ(mugicha)

### 5.6 動物
いぬ(inu)、ねこ(neko)、うま(uma)、うし(ushi)、ぶた(buta)、ひつじ(hitsuji)、やぎ(yagi)、うさぎ(usagi)、ねずみ(nezumi)、とり(tori)、からす(karasu)、すずめ(suzume)、かも(kamo)、つる(tsuru)、かめ(kame)、かえる(kaeru)、へび(hebi)、とかげ(tokage)、ちょう(chou)、あり(ari)、はち(hachi)、くも(kumo)、せみ(semi)、かぶとむし(kabutomushi)、くわがた(kuwagata)、ほたる(hotaru)、ざりがに(zarigani)、ことり(kotori)、ぞう(zou)、きりん(kirin)、らいおん(raion)、とら(tora)、くま(kuma)、しか(shika)、さる(saru)、ぱんだ(panda)、こあら(koara)、ぺんぎん(pengin)、いるか(iruka)、くじら(kujira)、さめ(same)、たこ(tako)、いか(ika)、かに(kani)、あひる(ahiru)、ふくろう(fukurou)、たぬき(tanuki)、きつね(kitsune)、おおかみ(ookami)、ひよこ(hiyoko)、にわとり(niwatori)

### 5.7 のりもの・踏切
でんしゃ(densha)、ふみきり(fumikiri)、しんごう(shingou)、せんろ(senro)、きしゃ(kisha)、れっしゃ(ressha)、とっきゅう(tokkyuu)、しんかんせん(shinkansen)、ちかてつ(chikatetsu)、ふね(fune)、ひこうき(hikouki)、じてんしゃ(jitensha)、くるま(kuruma)、しょうぼうしゃ(shoubousha)、きゅうきゅうしゃ(kyuukyuusha)、せんすいかん(sensuikan)、ききゅう(kikyuu)、そり(sori)、ろけっと(roketto)、ばす(basu)、とらっく(torakku)、ばいく(baiku)、いちりんしゃ(ichirinsha)、さんりんしゃ(sanrinsha)、ほどうきょう(hodoukyou)、ちかどう(chikadou)

### 5.8 がっこう
せんせい(sensei)、きょうしつ(kyoushitsu)、じゅぎょう(jugyou)、しゅくだい(shukudai)、きゅうしょく(kyuushoku)、たいいく(taiiku)、ずこう(zukou)、おんがく(ongaku)、さんすう(sansuu)、こくご(kokugo)、りか(rika)、しゃかい(shakai)、ともだち(tomodachi)、らんどせる(randoseru)、うわばき(uwabaki)、えんぴつ(enpitsu)、けしごむ(keshigomu)、きょうかしょ(kyoukasho)、くれよん(kureyon)、えのぐ(enogu)、はさみ(hasami)、のり(nori)、じょうぎ(jougi)、ぶんぼうぐ(bunbougu)、つくえ(tsukue)、いす(isu)、こくばん(kokuban)、たいそうふく(taisoufuku)、すいとう(suitou)、はんかち(hankachi)、ほうかご(houkago)、つうがく(tsuugaku)、きゅうけい(kyuukei)、うんどうかい(undoukai)、えんそく(ensoku)、にゅうがく(nyuugaku)、くく(kuku)

### 5.9 あそび
おもちゃ(omocha)、おにごっこ(onigokko)、かくれんぼ(kakurenbo)、なわとび(nawatobi)、すべりだい(suberidai)、ぶらんこ(buranko)、てつぼう(tetsubou)、すなば(sunaba)、まり(mari)、かるた(karuta)、おりがみ(origami)、ぬりえ(nurie)、えほん(ehon)、すごろく(sugoroku)、とらんぷ(toranpu)、ぱずる(pazuru)、つみき(tsumiki)、やきゅう(yakyuu)、たっきゅう(takkyuu)、すいえい(suiei)、はなび(hanabi)、まつり(matsuri)、ゆかた(yukata)、かきごおり(kakigoori)、わたあめ(wataame)、しゃぼんだま(shabondama)、たこあげ(takoage)、こま(koma)、けんだま(kendama)、だるま(daruma)、ふくわらい(fukuwarai)、あやとり(ayatori)、おてだま(otedama)、めんこ(menko)

### 5.10 むし
てんとうむし(tentoumushi)、とんぼ(tonbo)、かまきり(kamakiri)、ばった(batta)、こおろぎ(koorogi)、すずむし(suzumushi)、かたつむり(katatsumuri)、みみず(mimizu)、だんごむし(dangomushi)、あめんぼ(amenbo)、げんごろう(gengorou)、たがめ(tagame)、あげは(ageha)、もんしろちょう(monshirochou)

### 5.11 天気と季節
あめ(ame)、ゆき(yuki)、かぜ(kaze)、たいふう(taifuu)、かみなり(kaminari)、にじ(niji)、はれ(hare)、あさ(asa)、ひる(hiru)、ゆうがた(yuugata)、はる(haru)、なつ(natsu)、あき(aki)、ふゆ(fuyu)、つゆ(tsuyu)、こうよう(kouyou)、ゆきだるま(yukidaruma)、こおり(koori)、あられ(arare)、きり(kiri)、ひかげ(hikage)、ひなた(hinata)、かさ(kasa)、ながぐつ(nagagutsu)、てぶくろ(tebukuro)、ぼうし(boushi)

### 5.12 からだ
あたま(atama)、かお(kao)、みみ(mimi)、くち(kuchi)、は(ha)、て(te)、あし(ashi)、ゆび(yubi)、おなか(onaka)、せなか(senaka)、かみ(kami)、つめ(tsume)、ひざ(hiza)、ひじ(hiji)、かた(kata)、くび(kubi)、むね(mune)、こし(koshi)、ほね(hone)、しんぞう(shinzou)、のう(nou)、きんにく(kinnniku)、ねつ(netsu)、せき(seki)、くしゃみ(kushami)、けが(kega)、ばんそうこう(bansoukou)、くすり(kusuri)、いしゃ(isha)

### 5.13 いえの生活
おふろ(ofuro)、ふとん(futon)、まくら(makura)、はぶらし(haburashi)、せっけん(sekken)、たおる(taoru)、かがみ(kagami)、つめきり(tsumekiri)、でんき(denki)、れいぞうこ(reizouko)、せんたくき(sentakuki)、そうじき(soujiki)、こたつ(kotatsu)、とけい(tokei)、しんぶん(shinbun)、ほん(hon)、てがみ(tegami)、でんわ(denwa)、かぎ(kagi)、さいふ(saifu)、かばん(kaban)、くつ(kutsu)、くつした(kutsushita)、うわぎ(uwagi)、ずぼん(zubon)、ぱじゃま(pajama)

### 5.14 ふしぎ・りか
そりゅうし(soryuushi)、でんし(denshi)、ようし(youshi)、ちゅうせいし(chuuseishi)、げんし(genshi)、ぶんし(bunshi)、げんそ(genso)、すいそ(suiso)、へりうむ(heriumu)、たんそ(tanso)、ちっそ(chisso)、さんそ(sanso)、てつ(tetsu)、どう(dou)、きん(kin)、ぎん(gin)、あるみ(arumi)、なまり(namari)、あえん(aen)、すず(suzu)、ねおん(neon)、あるごん(arugon)、うらん(uran)、ぷるとにうむ(purutoniumu)、ひっぐす(higgusu)、あんちぶっしつ(anchibusshitsu)、ぜろ(zero)、ぷらす(purasu)、まいなす(mainasu)、じしゃく(jishaku)、でんち(denchi)、でんきゅう(denkyuu)、おんど(ondo)、きあつ(kiatsu)、おと(oto)、むしめがね(mushimegane)、けんびきょう(kenbikyou)

## 6. 進捗データ（端末内のみ）

IndexedDB（idb）に保存する。外部送信はしない。

- `kanaProgress`: かな単位の記録 { kana, correctCount, hintCount, lastPracticedAt }。定着度の判定（案内を外す・復習に出す）に使う。
- `lessonProgress`: レッスン単位 { lessonId, clearedAt }。解放の判定に使う。
- `wordProgress`: 単語単位 { wordId, typedCount }。ことば図鑑（§7）の表示に使う。
- `sessions`: { date, durationSec, typedKanaCount }。保護者ゲート内の確認用。
- `settings`: { soundOn, soundVolume }。

定着度の目安: ある かな が「案内なしで3回連続正解」したら定着とみなし、出題頻度を下げる。詰まり（ヒント使用・5秒停止）が続く かな は頻度を上げる。数値は実装時に調整する調整値として扱う。

## 7. 画面遷移と結果画面

結果画面と「積み上がり」の扱いは、さんすうクラフト（yubi-labo）の方式を参照して決める（同作の EndScreen と クラフト図鑑 §8.5 が典拠）。

1. 起動画面: 初回のみ IME オフの案内（ChromeOS の入力切り替え手順、保護者向け）。2回目以降は省略。
2. モード選択: 「レッスン」（ステージの続き）と「テーマで あそぶ」（単語パック）の大きなカード＋「ことば図鑑」への入口。
3. レッスン画面: お題・入力表示・バーチャルキーボード・手の図（v0.2 §3）。
4. 終了画面（結果画面）: **スコア・正答率・速さ・ミスは表示しない。** さんすうクラフトと同方式で、次の2要素だけを持つ。
   - 本人の自己申告（任意）: 「きょうは どうだった？」を3択（よかった／ふつう／たいへんだった）＋「こたえない」で記録できる。初期は OFF、保護者設定で ON にする（さんすうクラフト §8.5 と同じ）。
   - 「またね」の一言と、はじめに戻るボタン。
5. ことば図鑑（積み上がりの置き場所）: 終了画面とは別に置く。
   - **打てた単語だけ**をテーマ別に並べる。単語カードには かな と ローマ字 を併記する。
   - まだ打っていない単語の空き枠は出さない（収集のプレッシャーにしない、さんすうクラフト図鑑と同じ原則）。
   - 正答率・速さ・ヒント回数・ミスは図鑑にも表示しない。
6. 保護者ゲート: 設定（音の ON/OFF、自己申告の ON/OFF 等）と進捗の確認。開き方は yubi-labo と同方式。

## 8. 検討事項の現状（2026-11-26 更新）

- カタカナ: **v1 では扱わない**（決定）。将来必要になった時点で追加する。
- リズムモード: **v2 で扱う**（決定）。v1 には含めない。
- 結果画面と積み上がり: さんすうクラフト方式で確定（§7）。
- アプリ名: **「タイプクラフト」**（決定）。リポジトリ名 romaji-typing は技術名として据え置く（yubi-labo／さんすうクラフトと同じ関係）。
- 対象デバイスの表示: MacBook Air（ChromeOS Flex）の実機サイズは確認待ち。Ubuntu 入りの MacBook Pro（MacBookPro11,1、2013〜2014年世代）と同世代の Air のパネルは、11.6インチ 1366×768（A1465）か 13.3インチ 1440×900（A1466）のいずれか。**設計下限は小さい方の 1366×768** とし、ブラウザの実効表示域（縦は約650px）を前提に、レッスン画面（お題・キーボード・手の図）がスクロールなしで収まることを受け入れ条件に含める。
