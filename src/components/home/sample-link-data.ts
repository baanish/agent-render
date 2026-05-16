import type { ArtifactKind } from "@/lib/payload/schema";

export type SampleLinkCard = {
  title: string;
  hash: string;
  fragmentLength: number;
  kind: ArtifactKind;
  artifactCount: number;
  description?: string;
};

// The ARX showcase uses a precomputed async ARX3 fragment so the static homepage
// can advertise the real compact transport without loading Brotli on first paint.
export const sampleLinkCards = [
  {
    title: "Maintainer kickoff",
    hash: "#agent-render=v1.deflate.VVLbThsxEP2VkXkBiUTiNVVbtRUtUqFCBbUPLBKOPZtY67UtezYhBf69x5sL8LBeey5nzpmZJ5XU7OxUrcbTqJmy3HotrE6V4HWlXRB8nKlzpottC4eGI0dte53wymp296TcO1uHV69zZ-M67JBuUgYUvca0rxnT3sJQqx_R-7gmNOET3S6Z0jD3zlBZsvcU4poCsy2kKXOwnEFQllqoZfaFvOsYrtblIhPjdUFgFtdqI6dIlurT3s-16ShlXjleT2upo0P9MyomJq7GCd093tPvsQztVZF1mY34DbmAykwVg_M--mZIKWahH04uhjl993oVM1u62qeLnnsGq2BxLR0YFyn77J_MibJe08Xt1SUqlRpsab4hTEcPXvaBX6x9wwiHR9tG0K2K1sc1UEdhl3oIZklmyaar1ar5GUQzusKEm2gZCi6_ooDZc_VOJhMY3pzV-GdUupvEMxqj7Qb_c-skZqc9SuTYMxXRm4L2CLq-zfwWLWNCwVT8Q-J1jnYw4v5BYpt178KC1k6W5HVYDHrBAHRpx-h61BUHSQNADxhfM4SC1FZ2DH5T50wwrapVAw3ptQ9HdP6o--R3RNBVH01XfQ8PD3UE_DhOrkW3xEW0lQ1on4cVeyzEMRgueg4ygz4UW5zQUxMIWyhDDpX_6J1CfJbyFzKOGwUNQSbbRf3YqBP6TI3KlXqjaIZ770oBVqM-NOFlZFIJjWtQd-sw4sOum-xKgk7q49xBSx05lKMMKGME8CSdOE_Vy_3Lfw",
    fragmentLength: 790,
    kind: "markdown",
    artifactCount: 1,
  },
  {
    title: "Viewer bootstrap",
    hash: "#agent-render=v1.deflate.bY7BCsIwDIZfJeSksCle5_DoCwhenIe6ZVrs2tJlczD27mYdgqCXQL785PtH9JjtEuzjLDHDimqjmDBBlu2s6UUBbs5xy0F5wUpwH3HaPsgYQQGzy4j69_AUVLrq8-37uuF2EFz_x3MTGrwLDHVnS9bOwtLlNKdWaxgLCxCIu2Ahb5S2h2NQ94Ysp95JjipQgXWtSoZFAFGQb2N4X9hJPEY8s3G6Tm8",
    fragmentLength: 247,
    kind: "code",
    artifactCount: 1,
  },
  {
    title: "Phase 1 sample diff",
    hash: "#agent-render=v1.deflate.bZHbTsMwDIZfxYqQCuqZDS6KkPoI3FOkhdbtIrK0SrKD1PXdcZNNG2y-qJr49-_488gGVuQR27lvzQrWYCu5RRYxS6ePNTcIORi-GSRCI9qWMpwyA7f1mv41Kz5HJq5ufmYXL5wtNEokk-Scbu_c0SNcCcRxJyzw1Og6XaOUfWINfP85VkqoBg-Q-0iSZx-QZ9nrclmpOI7_OVQqDMMbm7KEOI8WEObRC5QlFeJh6LWFdqtqK3oFnUa0j08wUg5Ao91qBYFzCN7I9L5e8Q0WYKwWqnO1IUDdK2PBct2hhXeYJXA8QrDvtWycl5OdWqxciwgeRl8xrUgBU6VuGO1QG-p8oXS5qJTCPbSC1rbpG1riCY-nl_lIkoUPjy1tcJeqrZTXxK4tZ2ZZlBEzR-xMwI93EtJ8QZbkSTbPRcvd03LNIIVl09f0Cw",
    fragmentLength: 462,
    kind: "diff",
    artifactCount: 1,
  },
  {
    title: "Data export preview",
    hash: "#agent-render=v1.deflate.VY9NasQwDIWvYrR2Ct1m3WV7gqYL1Zaxif-QlcwMw9y9yqRQuhF8T0_S0x06zK8W9md1MIOnkFEILIjSGwoauvbGYjrTnuiiHdROIeHkhhLD_HmH9E9bldzYf7d8nLoZFfuITVQOf_aX03gcR5YU0IldU_V2bKUg35bKDX3BbpVW3y7VLvCOW3XRuEhuzWmI1XipysSE_rbAUo-oxNOIlLN1zZMOybia0TZ2ZE1Olaa6lW9i8sdAR3HR-hSCOs9XzZPM6DmJOYQF4PH1-AE",
    fragmentLength: 299,
    kind: "csv",
    artifactCount: 1,
  },
  {
    title: "arx showcase",
    hash: "#agent-render=v1.arx3.1.￰¡ທ况㮡猋䘔噑ⶰ瓛ସ妔쓤ㆉ줾岱ꉩ鴍Ⅻ䀇煃쨏鯕ꐦ뚣䨝᭺荕쐖꥚蕲홀抣줶⧂恨㞜굚昒筞嘖곔㊨Ꞡ샱چ踉䘄⯦侽Ҕ柀땗졜鄆劖ᛧ썹ⅶ쑚枣⢢栣床둴偯ł♉깑榉⡦簚ꔁ⢼魶傽캖ừঊﺺ潑筆ڷ㦟瓆ⷔ鍋您擌붨ꋀ䒽蒐훉ϫ찟ﯓ꿂␒駄꜂허Ƥሎ턛鏞믥ڻ꾪㕺ﰢ㏑碖胆숩䕏펦띆⼈鄇䯸讓䪜ᙵ⭺Ṡ鱸癰ͱ쑧㏧ⴳꥁ寀䓗乌仰鿢姝䧌븴䰮⻉䈉䚦왰ɝ紎㍷폺䘶猕哃ࡸꉩ冟坩휢㘙뤔魼砿㩧䒗篐ඇ茗念䢯㖅艧뷗ﵥ敧覍ൿ匒옞閜福탇䈥쬨曪㠓櫚끫㯞祘멡胅㙤⪸騛尰譬拹չ淥ꆃ쁹뭻さ痭憕莼䏬赚櫣ꂛ⨎⌙歇釓Ố戵穠줽閆㚠틋옕鼜훉ᇢꔰ眾㻨搓욱⦈鋂ώ뷐史쨳抃萐죰雇쐷㳻䜖ᕝ∍⃇墫颱ẑ恘歬â逵ᖒᾁ╷ﵨȹ牎㈣উ貂奼쉞茸箋堵ꇏ壊ᡧẄ㴬☿ᮑ孪洮怒躡㹻鸷務Ӎ蒺筒간袨塷⯀⳸얁䎤틣拻Ṭ㪙㩷雋㾭ȡ彰뛠謺㋈嶭㷪ઠꂈڶ넪ﴧ咝宆雗䩍ᛧ༤馶姗爼污晶涙灭ᄴ鲄⾁缛ꚰ䆷쎼䈒홡躮ᄳ絡䦾ｐଛ취뀓糳觸젳뫜灆ɳ틟᥼趞䠇☔穮䮜ﭑ崒쇏盾휛﬏戡镵䠄ᵫ闦㯦悑䗹榃슌钾䖋彷㺶薢⧷圄餒옹⬌㦑Ê蒻䉽뮹ݿ솰駫還衅픠⨣㆒䮲倎䯧묗ﻧኾ䵣ꈬ旸ﾆ㭌彚ඤጥ㑯ꘇᏘ椛ꅺ菅ᶫ퐢营탼佉葃닌࡭栫ﳣ⭱숼쯋겢匘割䐡펒喀肨蕢뤇帲쒿嚇क़ꭏஓ䱊蛸螼ዚ領쁎鮴蝰﷮쐊蹱ꥬ䜱䖂﬿쫫訜ሁⓉ䦰ꤊ嶱뿝킷ᯑ芊㨏갾ᛇ茭홷텆酉觾쯩裁߿䶱骯놙糨랰뱋∺쳝⓿掲䳌렊䞡漂嚩夆⹎㍁㞢ᔃ傥鮟땢♯娹リ鹛垣క씥㞸猏鄷䰼聎瞿僞㩡䬄滪䯌稊ゅꆸ憸融픗ⵘ㽆찶憎ᕷ캿櫄쿄몰屎こ攎㑕ꞏ恋趤༠呥લ໾冎鋅닃䰖錣뱋䥏蓢ᛌ她좬増鼿㆑⩅骉혝䦧忥餒팤旎섢Ђ曓ㅦ贮ݠ邆ટ훔䝫湂㊍ߊ罸铟ဖ榽軗ﯞǍ툚㴼彞带꽻鞡薵齥曩⤙꩟럾᪜计墵쾈쥖鷁ﰮ叝앯䧹郖篷칵덒晶癤㱫螃핊ꛩ颔⛼᢯결螲䭛콹䏓䅐뺍릏㖬儸⍭쉥ậ㠟种凟봊篳≚纛⳹ẜ饔續掚䱁㔷籕㐥蒾숳嫲ᗁˊ翇䔶뎮ᗞ现ꅨ鼃㼪ᖫ☗皧ꬍ틈牪ﮟ㱎䨃㫭럋ఖᶠ僂㝰⸨ꚧ냳녡마崚꾨産૫ꪞ㞣鑳ꟺ૧兟㵂ť䮫莲閗䯃⏭뿋阡൧仙㕴乜誴㥅滠켼¬즛펃䁦鬜⣻똢ꗕ躇엑渌鿍攅䛳좥ᠧ黇䪍㠠꒳䳚囮⥿긓릒ﴲহ㷼現⪱돌庙૵掷ﮠ⺬㏴꩘஄ꧪ〨㧓ᢝ鲛溻膳麅殡墂޸밝∇꠨儱뽑庶᯴閔뉌᫬迢䚼娉暫᥾뗶柈ٻ㩶黔㖝ꟓ럭癭ṧ㓈岒墼䨞鈖⼦⿖礇ᾉʑ안擴鶱♾轑窔㠆ꎋ篸≷폪뽵Ұ烻멝䡹⛙픮⻐웃殡ᮄꤒᡞ啾屿⧻댳ḧ闣釀É㢞뷟丸贑ỻ麎꣉넽윞ମ섈좃塼힛贫蝏㭺␓첫䬱厼園⼟튐苽驪힪Ň퐐︐ꗒﱕꦓ癳吹켘훌桡鍎뉝顚练艫ង灤覮浏袟唂繥珆餻ﴹ㕸泵ⱦ姐迳鉡츢撸⢟䱁䠫핏䢢즜聵矸䊯櫋䑸袸솧ꪃ婴埦뽵ᓆ姄ऑ垿꾜刈ᛇ䯔뭲紫Ӥ襡禺㢮恐狚ⷉ᣺툊桾⒥쳱冰厃▋㣿ܛ셹뚞ﷲ栾蠋뜺㕣ꉣᛋ封䣸矴耀咆┎喯ꇗ喏ꎸ棾⦉䵐Ӣ怨골﫿ѵ姸滮횳颮匶怪놟鳭놫柫贊쎖ℕ㼰ꖂ䖽룲ﴬ㍱캠ﱫ鵃쾒Ẃ觋跻Ä닑婢锟Њꀯ׼䒨ꦅ隣㮇䋓ࢀᣥ㭦霐䴣⺪甘﬽ꈞ㭩㇘灥夀鹷턨꡹掾俩抂藋濯㹴糞쑔鉶⣷ḽ꿖风繰﷗唥蘏㔉崹⦜嘃៯ᒖ鹿쇉핗晄喝獡뎉ꡪ諦峫㔗觠␷홳翭㟍೼ⰹ嫶ﳺ쥞䋠䕾텄눎娳”Є䀾傗겱矡ꇳ튏㻁⳸粱ﯓ씂떴⥪ꔝ㧊癶뙏뾤碓탨㣪쐫䖯슸轝ت跃熲빗泮㤋ꄰꁋⓚ㽾焁畂팵恥⤯謎䋕蟬磺髏ⅽ䌊徳ㄆ广⡇筨顯㲽珃鈆餋⌁갖悞՚켶␄녌給鿦씨ꂋ鯢녤襡⵷갑䠱迫ዕ䯵◮䧛ꐠ䣯큪䯠纫⍍孓䘪㥘墳ᢡ돆ꅘ㜇僤ふ夺풂몮旽ኈ遷挱팊₠搘铙鷜激翬噊얆輹跞丰橚ᓧ豃Ễꤣ䢙ந៶⦖睾鲴ﺟࡁ꽢孋僩즥ꧧ첟⸁猨崂ᖪ׳䭿ᓕ腔䉤挧쫗멚茳ꢡ龀ꈱᆖ挩䲖ᆪ潴聪륎痧振蕠఍ᾥ氶뾫茹⩐艬⸑前ﮏ鞁춍࿤硻။퓝䦒䭏䫆ꆁ㟶ꫝ㏀䫋샚匾쏄鰊ـ술ꋂ楲삈摇艅횓盧꒦♕ꂝ렚樭ˊჼ寧↮ꞻ蔃᪓⤎턑⥗ㇳຉ摶⟍ō䊦莝პ鼅颶淞餢偠뽃灻襸첁⴦龂赸頉㓲닄곝更턍ⲋ⸽茿獥엻",
    fragmentLength: 1487,
    kind: "json",
    artifactCount: 5,
    description: "Tuple compression, Brotli, and visible-length Unicode encoding compress 5 rich artifacts into a single URL fragment.",
  },
  {
    title: "Malformed manifest",
    hash: "#agent-render=v1.deflate.bY69DoJAEIRfhUyNBNor7X0Cz2KVPYPAHdk7TQzh3V1-ChJpNpn5diYzYoCpcnyW-4BBza6jxMiRVF2oc0F6rrOefOM4JgWk4C6hZX_auQJzHdEcslbdVwx-az0vD_tK9x8rtsA8arQ-yyyEO6bIFkZFWVRFaZGvKAn5OARJK3RCz569qo0LU_2dWZI3q4fpNv0A",
    fragmentLength: 220,
    kind: "json",
    artifactCount: 1,
  },
] satisfies readonly SampleLinkCard[];
