# Why Does This URL Look Weird?

agent-render links carry the artifact in the URL fragment:

```text
https://agent-render.com/#f<compressed-payload>
```

Everything before `#` loads the static app. Everything after `#` is the artifact payload the browser decodes locally.

## What the parts mean

- The first character after `#` is a single codec tag. Here `f` means the `arx5` codec. (The tag does not carry a dictionary version; it implies the current dictionary.)
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
```

For `arx`, `arx2`, `arx3`, `arx4`, and `arx5`, the compact tag does not carry a dictionary version — it implies the current dictionary (the build pins the newest supported version and rejects a newer one). Only the legacy header below carries an explicit dictionary version.

Older links may use the legacy shape, which the viewer still decodes:

```text
#agent-render=v1.<codec>.<payload>
```

where `<codec>` is `plain`, `lz`, or `deflate`, and the ARX-family legacy links include the dictionary version (`#agent-render=v1.arx.<dictVersion>.<payload>`, `arx2`, `arx3`, `arx4`, `arx5`). These legacy links are no longer emitted.

## Why arx exists

Artifacts can be bigger than a comfortable URL. The ARX family keeps links shorter by applying agent-render substitution dictionaries, Brotli or the context mixer, tuple envelopes, and binary-to-text encoding. Live links use chat-safe ASCII wires (usually base64url). Older `arx3`/`arx4` links may contain dense Unicode; the viewer still decodes them, but new links do not emit that form because Discord and WhatsApp percent-encode or mangle it.

## Privacy tradeoff

Fragments are useful because browsers do not send the part after `#` to the server during the initial page request. That means a static host can serve the viewer without receiving the artifact contents.

That is not the same thing as absolute secrecy. Fragment links can still appear in browser history, copied URLs, screenshots, link previews or tools that inspect full URLs, and any client-side analytics added later. Treat the link as bearer access to the artifact.

Use fragment links for quick static sharing. Use self-hosted UUID mode when the payload is too large, a chat app mangles long URLs, or you need short links and accept server-side storage.
