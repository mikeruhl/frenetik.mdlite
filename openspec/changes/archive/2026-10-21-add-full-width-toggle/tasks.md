## 1. Backend

- [x] 1.1 Add `store_get_full_width` / `store_set_full_width` in `config.rs` (key `full_width`, default `false`)
- [x] 1.2 Add `AppState.full_width`, initialised from the store
- [x] 1.3 Add View menu `CheckMenuItem` `toggle-full-width` after Show Outline, checked from `AppState`
- [x] 1.4 Handle the menu event: flip state, persist, emit `set-full-width`
- [x] 1.5 `cargo clippy -- -D warnings` and `cargo test` pass

## 2. Frontend

- [x] 2.1 Add `body.full-width` override in `src/styles.css`, screen only
- [x] 2.2 Read `full_width` at startup before first render; listen for `set-full-width`
- [x] 2.3 ESLint and `pnpm test` pass

## 3. Verification

- [x] 3.1 In the running app, toggle on/off in all 11 themes; confirm padding kept and Splendor unchanged
- [x] 3.2 Restart with Full Width on: no layout jump, menu checked
- [x] 3.3 Print preview identical with the setting on and off
