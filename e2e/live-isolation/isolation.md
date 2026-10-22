# Live Block isolation probe

This Document is the fixture for `e2e/live-isolation/run.mjs`. Its Live Block attempts every escape the
isolation model must prevent and writes the outcome of each attempt into `#results`.

The `commands` map must probe every command registered in `generate_handler!` in `src-tauri/src/lib.rs`;
the runner fails when the two sets differ. `follow_link` accepts only an opaque single-use token issued by
`resolve_link`, so it is probed with a bogus token and must not resolve.

```html-live
<pre id="results">running</pre>
<script>
  (async () => {
    const out = { internals: typeof window.__TAURI_INTERNALS__, chromeWebview: typeof (window.chrome && window.chrome.webview) };
    const settle = (fn) => {
      let p;
      try {
        p = Promise.resolve(fn());
      } catch (e) {
        return Promise.resolve("THREW " + String((e && e.message) || e).slice(0, 200));
      }
      return Promise.race([
        p.then(
          (v) => "RESOLVED " + String(JSON.stringify(v)).slice(0, 200),
          (e) => "REJECTED " + String((e && e.message) || e).slice(0, 200)
        ),
        new Promise((r) => setTimeout(() => r("PENDING"), 4000)),
      ]);
    };
    const probe = "isolation-test.invalid";
    const commands = {
      read_file: {}, get_mode: {}, get_startup_error: {}, open_folder_file: { path: "C:/Windows/win.ini" },
      start_folder_scan: { path: "C:/" }, cancel_folder_scan: {}, notify_outline_closed: {},
      set_outline_visible: { visible: true }, notify_has_frontmatter: { has: true }, copy_file_path: {},
      export_pdf: {}, check_for_updates: {}, get_interactive_session: {}, submit_answers: { answers: {} },
      cancel_interactive: {}, register_interactive_ready: {}, get_image_allowlist: {},
      allow_image_once: { url: "https://" + probe + "/a.png" }, allow_image_host: { host: probe },
      remove_image_host: { host: probe }, live_consent_check: { path: "x", content: "y" },
      live_consent_grant: { path: probe, content: probe },
      resolve_link: { href: "https://" + probe + "/" }, follow_link: { token: "isolation-probe-bogus-token", trustOrigin: true },
      file_exists: { path: "C:/Windows/win.ini" }, add_safe_file_type: { ext: "isoprobe" }, open_release_page: {},
      "plugin:event|emit": { event: "set-theme", payload: "retro" },
      "plugin:event|listen": { event: "set-theme", target: { kind: "Any" }, handler: 1 },
      "plugin:store|load": { path: "settings.json" },
      "plugin:dialog|message": { message: "isolation probe" },
      "plugin:dialog|open": {},
      "plugin:opener|open_url": { url: "https://" + probe + "/" },
      "plugin:cli|cli_matches": {},
      "plugin:webview|create_webview_window": { options: { label: "probe", url: "https://" + probe + "/" } },
      "plugin:window|set_title": { label: "main", value: "PROBE" },
      "plugin:app|version": {},
      "plugin:path|resolve_directory": { directory: 1 },
    };
    const names = Object.keys(commands);
    const results = await Promise.all(
      names.map((cmd) => (out.internals === "object" ? settle(() => window.__TAURI_INTERNALS__.invoke(cmd, commands[cmd])) : "NO_INTERNALS"))
    );
    names.forEach((cmd, i) => (out["invoke " + cmd] = results[i]));
    out.parentDocument = await settle(() => window.parent.document.title);
    out.fetchRemote = await settle(() => fetch("https://example.com/").then((r) => r.status));
    out.fetchIpc = await settle(() => fetch("http://ipc.localhost/get_image_allowlist", { method: "POST", body: "{}" }).then((r) => r.status));
    out.remoteImage = await new Promise((r) => {
      const img = new Image();
      img.onload = () => r("LOADED");
      img.onerror = () => r("BLOCKED");
      img.src = "https://example.com/favicon.ico";
      setTimeout(() => r("PENDING"), 4000);
    });
    out.windowOpen = await settle(() => String(window.open("https://example.com/")));
    document.getElementById("results").textContent = JSON.stringify(out);
    out.topNavigation = await settle(() => {
      window.top.location.href = "https://example.com/";
      return "assigned";
    });
    out.formSubmit = await settle(() => {
      const form = document.createElement("form");
      form.action = "https://example.com/";
      form.method = "post";
      document.body.appendChild(form);
      form.submit();
      return "submitted";
    });
    document.getElementById("results").textContent = JSON.stringify(out);
  })();
</script>
```
