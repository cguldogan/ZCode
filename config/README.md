# Built-in default configuration

`config/default.json` is the default configuration shipped with the client and must be kept.
Desktop reads it from the packaged file, Web imports it at build time; it is used as the
fallback when the remote request fails or lacks valid fields.

## Help configuration source

The newer community and feedback entry points request `GET /api/v1/client/configs` from the
current endpoint and read `data.configs.feedbackUrl`:

- `community_urls["zh-CN" | "en-US"]`: falls back only to the built-in entry for the current
  language, never across languages.
- `feedback_url`: the remote address wins when valid, otherwise the built-in address is used.
- `feedback_use_external_form`: the remote boolean wins; `false` is a valid override too.

The request carries `app_version`; Desktop also sends `platform-arch`, Web omits the platform
parameter. Successful responses are cached in memory for 1 hour only, requests use
`cache: no-store`, and failures are not cached.

```text
current endpoint client/configs -> valid help fields -> platform entry
                  | missing / failed
                  v
      built-in default.json -> platform entry
```

`default.json` is the built-in default configuration distributed with the client; historically
it was CDN-distributed and is kept only for older-client compatibility. The current version has
no request or URL construction path and depends solely on the built-in file in this directory;
other fields remain unchanged for existing consumers.

See [user community entry configuration](../docs/ui/settings-community-link-config.md) for the
detailed rules.
