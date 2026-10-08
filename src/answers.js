export function initialState(questions) {
  const state = Object.create(null);
  for (const q of questions) {
    const entry = { selected: [], otherChosen: false, other: "", text: "" };
    if (q.type === "single" && typeof q.default === "string") entry.selected = [q.default];
    if (q.type === "multi" && Array.isArray(q.default)) entry.selected = [...q.default];
    if (q.type === "text" && typeof q.default === "string") entry.text = q.default;
    state[q.id] = entry;
  }
  return state;
}

function answerFor(q, entry) {
  const other = entry.otherChosen ? entry.other.trim() : "";
  if (q.type === "single") {
    if (entry.otherChosen) return other ? { other } : undefined;
    return entry.selected.length ? { value: entry.selected[0] } : undefined;
  }
  if (q.type === "multi") {
    const values = q.options.map((o) => o.value).filter((v) => entry.selected.includes(v));
    if (!values.length && !other) return undefined;
    return other ? { values, other } : { values };
  }
  return entry.text.trim() ? { text: entry.text } : undefined;
}

/** Builds the `submit_answers` payload, omitting unanswered questions. */
export function toPayload(questions, state) {
  const payload = Object.create(null);
  for (const q of questions) {
    const answer = answerFor(q, state[q.id]);
    if (answer) payload[q.id] = answer;
  }
  return payload;
}

export function missingRequired(questions, payload) {
  return questions.filter((q) => q.required && !Object.hasOwn(payload, q.id)).map((q) => q.id);
}

export function isDirty(questions, state, baseline) {
  return JSON.stringify(toPayload(questions, state)) !== JSON.stringify(toPayload(questions, baseline));
}
