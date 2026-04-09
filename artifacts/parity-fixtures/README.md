# Parity Fixtures

This directory defines the named fixtures referenced by the parity-class plan.

## Fixtures

- `shipping-parity-golden.json`
  - Expected to represent a valid parity-lane creative-html artifact for the boardroom-editorial single-page operational report class.
  - Expected result: pass, or warning-only on non-blocking polish drift.

- `shipping-parity-degraded-generic-cards.json`
  - Expected to represent a structurally degraded creative-html artifact that keeps the same business domain but collapses into generic cards, weak interaction, or missing required zones.
  - Expected result: hard fail when parity-lane validation is active.

## Validation intent

The fixtures are not design inspiration. They are regression anchors for:

- explicit parity-lane activation
- required zone presence
- semantic `context.reportData` usage
- canonical filter wiring
- modify-flow preservation expectations

## Suggested smoke usage

1. Load the fixture JSON into the same validation/self-check path used by sidecar creative-html generation.
2. Confirm the golden fixture passes parity checks.
3. Confirm the degraded fixture fails parity checks for the intended reasons.

## Lightweight local verification

Run:

```bash
node artifacts/parity-fixtures/verify-parity-fixtures.mjs
```

The script performs static contract checks only. It does not need the full app stack or running APIs. It verifies:

- explicit parity-lane activation hints
- required zone inventory for the golden fixture
- intentional generic-card collapse for the degraded fixture
- presence or absence of `context.reportData`, `context.filters`, and `deriveView()` where expected

## Browser preview smoke preparation

Generate browser-preview payloads:

```bash
node artifacts/parity-fixtures/build-browser-preview-payload.mjs
```

Serve a generated payload:

```bash
node artifacts/parity-fixtures/serve-browser-preview.mjs golden
node artifacts/parity-fixtures/serve-browser-preview.mjs degraded
```

The server prints a `preview.json` URL plus a desktop renderer dev URL in `browser-preview` mode. This allows parity fixtures to run through the real `CreativeHtmlPageRenderer` using `prefetchedRowsByQuery`, without depending on a live query API.

## Repeatable smoke command

Run:

```bash
node artifacts/parity-fixtures/run-parity-smoke.mjs
```

This command is the repeatable parity baseline smoke. It will:

1. verify fixture contracts
2. regenerate browser-preview payloads
3. start ephemeral preview servers for both fixtures
4. assert `/health` and `/preview.json` respond correctly
5. confirm parity runtime hints and prefetched query rows are preserved

It does not require the desktop app or a live query API to be running.
