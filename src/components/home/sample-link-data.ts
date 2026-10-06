import type { ArtifactKind } from "@/lib/payload/schema";

export type SampleLinkCard = {
  title: string;
  hash: string;
  fragmentLength: number;
  kind: ArtifactKind;
  artifactCount: number;
  description?: string;
};

// The ARX showcase uses a precomputed automatic ARX6 fragment so the static homepage
// can advertise the real compact transport without loading the mixer on first paint.
export const sampleLinkCards = [
  {
    title: "Maintainer kickoff",
    hash: "#dVVLbThsxEP2VkXkBiUTiNVVbtRUtUqFCBbUPLBKOPZtY67UtezYhBf69x5sL8LBeey5nzpmZJ5XU7OxUrcbTqJmy3HotrE6V4HWlXRB8nKlzpottC4eGI0dte53wymp296TcO1uHV69zZ-M67JBuUgYUvca0rxnT3sJQqx_R-7gmNOET3S6Z0jD3zlBZsvcU4poCsy2kKXOwnEFQllqoZfaFvOsYrtblIhPjdUFgFtdqI6dIlurT3s-16ShlXjleT2upo0P9MyomJq7GCd093tPvsQztVZF1mY34DbmAykwVg_M--mZIKWahH04uhjl993oVM1u62qeLnnsGq2BxLR0YFyn77J_MibJe08Xt1SUqlRpsab4hTEcPXvaBX6x9wwiHR9tG0K2K1sc1UEdhl3oIZklmyaar1ar5GUQzusKEm2gZCi6_ooDZc_VOJhMY3pzV-GdUupvEMxqj7Qb_c-skZqc9SuTYMxXRm4L2CLq-zfwWLWNCwVT8Q-J1jnYw4v5BYpt178KC1k6W5HVYDHrBAHRpx-h61BUHSQNADxhfM4SC1FZ2DH5T50wwrapVAw3ptQ9HdP6o--R3RNBVH01XfQ8PD3UE_DhOrkW3xEW0lQ1on4cVeyzEMRgueg4ygz4UW5zQUxMIWyhDDpX_6J1CfJbyFzKOGwUNQSbbRf3YqBP6TI3KlXqjaIZ770oBVqM-NOFlZFIJjWtQd-sw4sOum-xKgk7q49xBSx05lKMMKGME8CSdOE_Vy_3Lfw",
    fragmentLength: 767,
    kind: "markdown",
    artifactCount: 1,
  },
  {
    title: "Viewer bootstrap",
    hash: "#dbY7BCsIwDIZfJeSksCle5_DoCwhenIe6ZVrs2tJlczD27mYdgqCXQL785PtH9JjtEuzjLDHDimqjmDBBlu2s6UUBbs5xy0F5wUpwH3HaPsgYQQGzy4j69_AUVLrq8-37uuF2EFz_x3MTGrwLDHVnS9bOwtLlNKdWaxgLCxCIu2Ahb5S2h2NQ94Ysp95JjipQgXWtSoZFAFGQb2N4X9hJPEY8s3G6Tm8",
    fragmentLength: 224,
    kind: "code",
    artifactCount: 1,
  },
  {
    title: "Phase 1 sample diff",
    hash: "#dbZHbTsMwDIZfxYqQCuqZDS6KkPoI3FOkhdbtIrK0SrKD1PXdcZNNG2y-qJr49-_488gGVuQR27lvzQrWYCu5RRYxS6ePNTcIORi-GSRCI9qWMpwyA7f1mv41Kz5HJq5ufmYXL5wtNEokk-Scbu_c0SNcCcRxJyzw1Og6XaOUfWINfP85VkqoBg-Q-0iSZx-QZ9nrclmpOI7_OVQqDMMbm7KEOI8WEObRC5QlFeJh6LWFdqtqK3oFnUa0j08wUg5Ao91qBYFzCN7I9L5e8Q0WYKwWqnO1IUDdK2PBct2hhXeYJXA8QrDvtWycl5OdWqxciwgeRl8xrUgBU6VuGO1QG-p8oXS5qJTCPbSC1rbpG1riCY-nl_lIkoUPjy1tcJeqrZTXxK4tZ2ZZlBEzR-xMwI93EtJ8QZbkSTbPRcvd03LNIIVl09f0Cw",
    fragmentLength: 439,
    kind: "diff",
    artifactCount: 1,
  },
  {
    title: "Data export preview",
    hash: "#dVY9NasQwDIWvYrR2Ct1m3WV7gqYL1Zaxif-QlcwMw9y9yqRQuhF8T0_S0x06zK8W9md1MIOnkFEILIjSGwoauvbGYjrTnuiiHdROIeHkhhLD_HmH9E9bldzYf7d8nLoZFfuITVQOf_aX03gcR5YU0IldU_V2bKUg35bKDX3BbpVW3y7VLvCOW3XRuEhuzWmI1XipysSE_rbAUo-oxNOIlLN1zZMOybia0TZ2ZE1Olaa6lW9i8sdAR3HR-hSCOs9XzZPM6DmJOYQF4PH1-AE",
    fragmentLength: 276,
    kind: "csv",
    artifactCount: 1,
  },
  {
    title: "arx showcase",
    hash: "#g3mtE0aqtgHM0tPKx_bBQh2e2ssR9GEwncqx3C2NNsw9BXLGgrM0nRNYeQa6pUzSZIB-YB-Bp.wJOSxvXf4teK~5WjVeq3L1KA1MIgbJ2O1KDGae-nYnS0oJRjil~CQbypZZAveYXVc2tFH3zhRD9aYxbHhcJVRzdd3YFWFkca-gOof_cyJUjffbrNa15J2K4VUTQQZS~NeMUBALu_o0QVkAjzyGTLV3r2QjDrAKTfOgfh20coPWO6nh~DwAPoXDu1uGrn_5MhqLsu1EAbDVGrc~c8vjDgXusxPAp-v9Ug7IwmJi4jfL8_ew_yTJAU1nu-eYisjdI3HOOAroZ00V12.oEqwpkrzZq6xYfZUqGxL10.YArTMkvC5HFSJfye8BgJtrTYwTyrhdvg.0uhs~Z_UnUTXjCLKz-3NOaqTCj_VtLFq-shsfqkeQGBHzaa9Bk5Bxh5MWZFlAlECvStuTBtswY9W_TE6kR6KFcUGnnXGru7BPncN-vxbtq_.cqjKeFf0H0cAAb85_xHs7yOLdtU2pSddctooCKGbRPh_ggQfm4vAwK2Om1tL246e5YJf5ojXyM.T9ZOvhGPAflWLuerevshWXj4bBHgMgAB_Grz8Vy1R3rv58~zTY~UXp5Nv95At__CPhmUnMuUcBZNq44JcbZLZFPAbLfd3YSXw3DqgpsCsQBZ8aWBf4FBjj6~dCef93coDp9LRj-rB_Hv2hSWIoUvoHbnCR2H0_bTn_FTOa4GGU1.PzgbQPX1-KnDL.2e6rQtSNc3VBG6xZT6.GSXLYweox4V0ALouR195sTD7xSOZmzmQvsNOP_JBbMyR6ALSyTB6ENdx0WJTyp4ARRJev8qDCW2yPoQq~x_kJIFYB97GHO4w1uCBVEeLyy9NeiML0T5YZg7opNCckiZ6p0hlHNn5_wgfMMp9kUvRr_~ynH9_38N.GR9mWb1dflgpnVUlcRYZD0__yHcfcViF3LN3xux3VNi3LTnAG8flQPR~SjaCQ_5hIw8xCGnHAHGmWcP~jeU8HWOk2nON58qiiBKTkjlyi0sNlEIBHjP0PGAnZA9~y~HI0a94GBu1Vqa3U1DOB.90x8VAiO~ijm4jP8C7fbwxkMhEPZYz~Z1XPYPflGDE-lKNQ9NDJOvdHLaqgHfr-bqdAg6QndlHxYS24tDhjPJAmQAu~0kSWRe6HnDVRIfqh2SY5a57xi7IZTOzBcJlRi_KsUj2uGb3C1YJTCKhU0Epe6lrT-KPg0aEp-EvM0Z7lK1pJumgmoSw.yc-hgqOwuvb6OTKMjusOFwTU0m1z4uQ-lzRT-iMx.wL9gp-UQl5BT4DdHh8DeX1WHmIS0o5l_hWQkw2pcKAigy4cOJStz1m39fEAaIZW1gleUUcSj6JJQa6itnq.QiUXYrfTTDHBpJtJ61jTMveYb_41mRLUUC9g-sUn0~iw9EUB_uAKwBRzRrO.QlQ-1639dQPzQNdCBU.GHV.vqp_bvCDJJk7qEdoAqHzaTD3u2D0XOTXNTUsJetxfdConpwtrz7eAGlgBhkIfT2eR-qRtxZh04FgfGbzl.Mv4qN.Gxo~q0GV2qGON8i6~xe5QybX8TTXwJlWzn_t_syC9gH2YHFVd_zU9dh.iytXfC69dgraUNcyc.IcAl.53YPBWMVzZONIMlyZI2-WaD.WN1si~~UnQ5fN1tnvO96RhIztxm42XyP9hNBiGB7TH4xjk6-EF64QvuyTMgUFY4jMjXp9yBBUe1cEyyxBawxr3G-7.2x.eh3nfG851Du18Zhu7Pmq8.mMvI9jVRp5z39IB4wtXy4S0aX5JCaPv9H1bvhyy2OeOorV0fPARxOqG6_z6oE~~.8eynuhUbvRZ.xhePXFWT14k1bdfEgu1P7cunjLRLOVAglcGOUtrc09fUrGP6E.niGW4v~nD7MTU0hS4aew6sRw88-33xgTM~w4-Hi5-JaTcj~YmzmyX7T0fRWeK7iN",
    fragmentLength: 1979,
    kind: "json",
    artifactCount: 5,
    description: "Tuple compression and the context mixer, scored by honest transport length, compress 5 rich artifacts into a chat-safe URL fragment.",
  },
  {
    title: "Malformed manifest",
    hash: "#dbY69DoJAEIRfhUyNBNor7X0Cz2KVPYPAHdk7TQzh3V1-ChJpNpn5diYzYoCpcnyW-4BBza6jxMiRVF2oc0F6rrOefOM4JgWk4C6hZX_auQJzHdEcslbdVwx-az0vD_tK9x8rtsA8arQ-yyyEO6bIFkZFWVRFaZGvKAn5OARJK3RCz569qo0LU_2dWZI3q4fpNv0A",
    fragmentLength: 197,
    kind: "json",
    artifactCount: 1,
  },
] satisfies readonly SampleLinkCard[];
