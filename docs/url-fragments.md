# Why Does This URL Look Weird?

agent-render links carry the artifact in the URL fragment:

```text
https://agent-render.com/#agent-render=v1.arx3.1.<compressed-payload>
```

Everything before `#` loads the static app. Everything after `#` is the artifact payload the browser decodes locally.

## What the parts mean

- `agent-render` tells the app this hash belongs to agent-render.
- `v1` is the payload format version.
- `arx3` is the compression codec.
- `1` is the arx dictionary version.
- `<compressed-payload>` is the encoded artifact bundle.

Other links may use a shorter shape:

```text
#agent-render=v1.<codec>.<payload>
```

where `<codec>` is `plain`, `lz`, or `deflate`. ARX-family links include the dictionary version:

```text
#agent-render=v1.arx.<dictVersion>.<payload>
#agent-render=v1.arx2.<dictVersion>.<payload>
#agent-render=v1.arx3.<dictVersion>.<payload>
```

## Why arx exists

Artifacts can be bigger than a comfortable URL. The ARX family keeps links shorter by applying agent-render substitution dictionaries, Brotli compression, tuple envelopes for arx2/arx3, and binary-to-text encoding. `arx3` favors compact visible Unicode fragments, so it can look especially strange even though the browser decodes it locally.

## Privacy tradeoff

Fragments are useful because browsers do not send the part after `#` to the server during the initial page request. That means a static host can serve the viewer without receiving the artifact contents.

That is not the same thing as absolute secrecy. Fragment links can still appear in browser history, copied URLs, screenshots, link previews or tools that inspect full URLs, and any client-side analytics added later. Treat the link as bearer access to the artifact.

Use fragment links for quick static sharing. Use self-hosted UUID mode when the payload is too large, a chat app mangles long URLs, or you need short links and accept server-side storage.
