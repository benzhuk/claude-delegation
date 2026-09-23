VERDICT: PASS — fef6eaef6211ee54255c47e5c737b84f9f1ea986

Committed `release: wire 0.17.0 decisions pickup` at `fef6eaef6211ee54255c47e5c737b84f9f1ea986`.

Changed only `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `README.md`. Both manifests are valid JSON and carry matching `0.17.0` versions.

The release wiring describes the approved callable one-shot pickup for a registered decisions page using the existing reader and note transport: immutable captures, a single pickup-host and authorization-project page binding, conservative uncertainty recovery, and explicit owner accounting.

It explicitly does not claim scheduler activation, automatic owner revival, automatic `Done` clearing, or two-host validation. No source behavior files or work records were edited.

No test suite was run, as instructed. Verification was JSON parsing, version equality, `git diff --check`, and source-to-release-copy limit review. Awaiting the parent's full-suite grant.
