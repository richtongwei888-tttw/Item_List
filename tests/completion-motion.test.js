const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("completion toggle waits for the exit animation before mutating task state", () => {
  assert.match(appSource, /const\s+COMPLETION_EXIT_MS\s*=/);
  assert.match(appSource, /const\s+COMPLETION_COLLAPSE_DELAY_MS\s*=/);
  assert.match(appSource, /function\s+completeTaskWithAnimation\s*\(\s*task\s*,\s*item\s*,\s*button\s*\)/);
  assert.match(appSource, /item\.classList\.add\("is-completing"\)/);
  assert.match(appSource, /button\.disabled\s*=\s*true/);
  assert.match(appSource, /window\.setTimeout\(\s*\(\)\s*=>\s*{[\s\S]*task\.completed\s*=\s*true[\s\S]*render\(\)/);
});

test("completion animation shrinks the fixed list height as the row collapses", () => {
  assert.match(appSource, /function\s+syncListSectionHeight\s*\(\s*\{\s*taskCountDelta\s*=\s*0\s*\}\s*=\s*\{\}\s*\)/);
  assert.match(appSource, /const\s+taskCount\s*=\s*Math\.max\(elements\.taskList\.children\.length\s*\+\s*taskCountDelta,\s*0\)/);
  assert.match(appSource, /function\s+syncCompletionListHeight\s*\(\s*task\s*,\s*item\s*\)/);
  assert.match(appSource, /syncListSectionHeight\(\{\s*taskCountDelta:\s*-1\s*\}\)/);
  assert.match(appSource, /},\s*COMPLETION_COLLAPSE_DELAY_MS\)/);
});

test("completion motion css defines check pop and card collapse states", () => {
  assert.match(cssSource, /\.task-item\.is-completing\s*{/);
  assert.match(cssSource, /\.task-item\.is-completing\s+\.status-button::before\s*{/);
  assert.match(cssSource, /\.task-item\.is-completing\s+\.status-button::after\s*{/);
  assert.match(cssSource, /@keyframes\s+status-fill/);
  assert.match(cssSource, /@keyframes\s+status-check-pop/);
  assert.match(cssSource, /@keyframes\s+task-complete-collapse/);
});
