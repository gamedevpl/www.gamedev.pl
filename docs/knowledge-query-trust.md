# Knowledge query corpus boundary

`knowledge_query` excludes the creator-authored `spec` corpus in every mode and
scope. The default scope selects the known documentation, Kit, editor, and example
corpora explicitly. `docs` selects only `doc` and `skill`. The seed path continues
to request chunks with `scope: kit`.

Search results marked as specs, or pointing to `SPEC.md`, are discarded before
return or cache insertion. An answer citing a spec is discarded entirely and falls
back to the filtered chunks path. Specs are not exposed under an additional scope.
The cache key includes the trusted-corpus policy version as well as mode, scope,
and normalized query.

Deploy the API change to apply the new filters. No corpus reindex or enum change
is needed; specs may remain indexed but are excluded from this tool. This policy
addresses spec injection and does not guarantee that every indexed document is
correct or that a synthesized answer is accurate.
