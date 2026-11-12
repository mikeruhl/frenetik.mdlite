import { buildRichCopy } from "./rich-copy.js";

const INCOMPLETE_NOTE = " (diagrams may be incomplete)";
const REPLACED_NOTE = " (some content replaced)";
const CANCELED_NOTE = "Copy canceled: document changed";

let latestRequest = 0;

/** Writes `source` to the clipboard verbatim and reports the outcome through `notify` or `report`. */
export async function copyMarkdown({ source, invoke, notify, report }) {
  latestRequest++;
  try {
    if (await invoke("copy_document_markdown", { markdown: source })) notify("Markdown copied");
  } catch (err) {
    report(err);
  }
}

/**
 * Builds the rich text payload from the rendered document under `root` once rich blocks have settled, writes it to the
 * clipboard, and reports the outcome. `ready` resolves false when rich blocks did not finish in time. `generation`
 * identifies the rendered document; the copy is canceled when it changes while waiting for rich blocks. A copy that is
 * still pending when another document copy is requested is dropped so the newest request owns the clipboard.
 */
export async function copyRichText({ root, ready, generation, invoke, notify, report, build = buildRichCopy }) {
  const request = ++latestRequest;
  const superseded = () => request !== latestRequest;
  try {
    const started = generation();
    const complete = await ready();
    if (superseded()) return;
    if (generation() !== started) {
      notify(CANCELED_NOTE);
      return;
    }
    const { html, plain, omitted } = await build(root);
    if (superseded()) return;
    if (!(await invoke("copy_document_rich", { html, plain }))) return;
    notify("Rich text copied" + (!complete ? INCOMPLETE_NOTE : omitted > 0 ? REPLACED_NOTE : ""));
  } catch (err) {
    report(err);
  }
}
