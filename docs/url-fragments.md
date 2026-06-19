# Why Does This URL Look Weird?

agent-render links carry the artifact in the URL fragment:

```text
https://agent-render.com/#c<compressed-payload>
```

Everything before `#` loads the static app. Everything after `#` is the artifact payload the browser decodes locally.

## What the parts mean

- The first character after `#` is a single codec tag. Here `c` means the `arx3` codec (and its active dictionary version).
- `<compressed-payload>` is the encoded artifact bundle.

The tag char identifies the codec:

```text
#p<payload>   (plain)
#l<payload>   (lz)
#d<payload>   (deflate)
#a<payload>   (arx)
#b<payload>   (arx2)
#c<payload>   (arx3)
```

For `arx`, `arx2`, and `arx3`, the tag also encodes the active dictionary version.

Older links may use the legacy shape, which the viewer still decodes:

```text
#agent-render=v1.<codec>.<payload>
```

where `<codec>` is `plain`, `lz`, or `deflate`, and the ARX-family legacy links include the dictionary version (`#agent-render=v1.arx.<dictVersion>.<payload>`, `arx2`, `arx3`). These legacy links are no longer emitted.

## Why arx exists

Artifacts can be bigger than a comfortable URL. The ARX family keeps links shorter by applying agent-render substitution dictionaries, Brotli compression, tuple envelopes for arx2/arx3, and binary-to-text encoding. `arx3` favors compact visible Unicode fragments, so it can look especially strange even though the browser decodes it locally.

## Privacy tradeoff

Fragments are useful because browsers do not send the part after `#` to the server during the initial page request. That means a static host can serve the viewer without receiving the artifact contents.

That is not the same thing as absolute secrecy. Fragment links can still appear in browser history, copied URLs, screenshots, link previews or tools that inspect full URLs, and any client-side analytics added later. Treat the link as bearer access to the artifact.

Use fragment links for quick static sharing. Use self-hosted UUID mode when the payload is too large, a chat app mangles long URLs, or you need short links and accept server-side storage.
