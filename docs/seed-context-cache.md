# Seed prompt context caching

The generation prompt puts fixed rules, the complete scaffold and selected reference
sources before request-specific knowledge results, target slug/title, creator brief and
regeneration steer. The source budget, file contents, output scope, model settings and
single repair limit are unchanged.

This enables provider prefix reuse across requests sharing the same context. It does
not cache generated games or reuse a creator's output for another creator. Reference
selection still runs independently; different references or source snapshots can reduce
the shared prefix. The scaffold remains shared when the references differ.

Vertex implicit caching is enabled by default and requires no cache objects, storage
TTL, warm-up requests or new environment variables. Cache hits are not guaranteed.
Google recommends putting large shared content first and making similar requests close
together: [Vertex context caching](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview).

`seed generated` logs and the job's `seed` cost entry retain reported cache reads.
`usage.inputTokens` / ledger `tokens.input` include those reads; subtract
`cachedInputTokens` / `tokens.cached` before pricing uncached input. A missing cache
count means the provider did not report one, rather than a proven cache miss.
For Vertex, output includes both visible content and billed thinking tokens. Picker,
generation and the optional repair are summed without counting cache input twice.

Evaluate savings using reported cache tokens and current provider rates, with repairs
included. A successful bundle or typecheck is only a prerequisite: also assemble and
play the generated game, checking brief fidelity. A lab cache hit is not a production
hit-rate measurement, and fewer output tokens alone do not demonstrate equal quality.
