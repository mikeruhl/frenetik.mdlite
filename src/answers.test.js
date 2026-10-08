import { describe, it, expect } from "vitest";
import { initialState, toPayload, missingRequired, isDirty } from "./answers.js";

const questions = [
  {
    id: "strategy",
    type: "single",
    required: true,
    allowOther: true,
    default: "redis",
    options: [{ value: "redis" }, { value: "memory" }],
  },
  { id: "risks", type: "multi", allowOther: true, options: [{ value: "a" }, { value: "b" }] },
  { id: "notes", type: "text" },
];

describe("answer state", () => {
  it("applies defaults", () => {
    const state = initialState(questions);
    expect(toPayload(questions, state)).toEqual({ strategy: { value: "redis" } });
  });

  it("builds payload shapes per type", () => {
    const state = initialState(questions);
    state.risks.selected = ["b", "a"];
    state.risks.otherChosen = true;
    state.risks.other = " c ";
    state.notes.text = "hello";
    expect(toPayload(questions, state)).toEqual({
      strategy: { value: "redis" },
      risks: { values: ["a", "b"], other: "c" },
      notes: { text: "hello" },
    });
  });

  it("uses Other for single choice and drops blank answers", () => {
    const state = initialState(questions);
    state.strategy.otherChosen = true;
    state.strategy.other = "custom";
    state.notes.text = "   ";
    expect(toPayload(questions, state)).toEqual({ strategy: { other: "custom" } });
  });

  it("treats Other with blank text as unanswered", () => {
    const state = initialState(questions);
    state.strategy.otherChosen = true;
    expect(missingRequired(questions, toPayload(questions, state))).toEqual(["strategy"]);
  });

  it("detects dirty state against the defaults", () => {
    const baseline = initialState(questions);
    const state = initialState(questions);
    expect(isDirty(questions, state, baseline)).toBe(false);
    state.notes.text = "x";
    expect(isDirty(questions, state, baseline)).toBe(true);
  });
});
