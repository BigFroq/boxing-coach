import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { RefinementModal } from "./refinement-modal";

// Regression: a `slider`-format question (power_speed) rendered no control in
// the refinement modal — options.map([]) produced nothing and Next stayed
// disabled forever, stranding the user mid-quiz.
test("slider question renders a range control + labels (was rendering nothing)", () => {
  const html = renderToString(
    createElement(RefinementModal, {
      questionIds: ["power_speed", "stance"],
      onSubmit: () => {},
      onClose: () => {},
    }),
  );
  // The bug: slider format fell through to options.map([]) → zero controls.
  expect(html).toContain('type="range"');
  expect(html).toContain("Heavy hands, fewer shots");
  expect(html).toContain("Fast combos, volume over power");
});
