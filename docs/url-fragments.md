# Why Does This URL Look Weird?

agent-render links carry the artifact in the URL fragment:

```text
https://agent-render.com/#g<compressed-payload>
```

Everything before `#` loads the static app. Everything after `#` is the artifact payload the browser decodes locally.

## What the parts mean

- The first character after `#` identifies the codec. Here `g` means ARX6. New ARX6 links then carry model version `3`, a prior id, and compressed text with an embedded corruption checksum.
- `<compressed-payload>` is the encoded artifact bundle.

The tag char identifies the codec:

```text
#p<payload>   (plain)
#l<payload>   (lz)
#d<payload>   (deflate)
#a<payload>   (arx)
#b<payload>   (arx2)
#c<payload>   (arx3, deprecated emit)
#e<payload>   (arx4, deprecated emit)
#f<payload>   (arx5)
#g<payload>   (arx6)
```

For `arx` through `arx5`, compact tags imply a pinned dictionary/model. New ARX6 links explicitly carry model version 3: `#g3<prior><digits>`. Existing `#g2<prior><digits>` and older `#g<prior><fraction>` links still use their frozen decoders. The experimental `#g1L` research wire is not a viewer link format.

Older links may use the legacy shape, which the viewer still decodes:

```text
#agent-render=v1.<codec>.<payload>
```

where `<codec>` is `plain`, `lz`, or `deflate`, and the ARX-family legacy links include the dictionary version (`#agent-render=v1.arx.<dictVersion>.<payload>`, `arx2`, `arx3`, `arx4`, `arx5`). These legacy links are no longer emitted; `arx6` never used this form.

## Why arx exists

Artifacts can be bigger than a comfortable URL. The ARX family shortens them with dictionary substitution, Brotli or adaptive context mixing, and compact envelope framing. Versioned ARX6 skips body substitutions, preserves raw text exactly, and uses a mixed-radix fraction over `0-9A-Za-z-._~` with an embedded checksum. Default automatic encoding compares it against every existing live codec and keeps it only when the complete serialized fragment gets shorter. ARX5 and older live codecs usually select base64url. ARX3/ARX4 links may contain dense Unicode; they remain readable, but automatic encoding excludes them because visible character counts hide percent-encoding costs on chat surfaces.

## Privacy tradeoff

Fragments are useful because browsers do not send the part after `#` to the server during the initial page request. That means a static host can serve the viewer without receiving the artifact contents.

That is not the same thing as absolute secrecy. Fragment links can still appear in browser history, copied URLs, screenshots, link previews or tools that inspect full URLs, and any client-side analytics added later. Treat the link as bearer access to the artifact.

Use fragment links for quick static sharing. Use self-hosted UUID mode when the payload is too large, a chat app mangles long URLs, or you need short links and accept server-side storage.
