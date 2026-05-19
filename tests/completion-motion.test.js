const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

test("task form captures a three-level importance choice with normal as the default", () => {
  assert.match(htmlSource, /name="priority"/);
  assert.match(htmlSource, /value="low"[\s\S]*低/);
  assert.match(htmlSource, /value="normal"[\s\S]*checked[\s\S]*普通/);
  assert.match(htmlSource, /value="high"[\s\S]*高/);
  assert.match(appSource, /priorityInput:\s*document\.querySelector\('\[name="priority"\]:checked'\)/);
});

test("new tasks persist priority and use normal when no priority is provided", () => {
  assert.match(appSource, /const\s+PRIORITY_META\s*=/);
  assert.match(appSource, /function\s+normalizePriority\s*\(\s*priority\s*\)/);
  assert.match(appSource, /function\s+createTask\s*\(\s*title\s*,\s*dueDate\s*,\s*priority\s*=\s*"normal"\s*\)/);
  assert.match(appSource, /priority:\s*normalizePriority\(priority\)/);
  assert.match(appSource, /createTask\(title,\s*dueDate,\s*priority\)/);
});

test("open tasks with the same due date sort by importance before creation time", () => {
  assert.match(appSource, /const\s+PRIORITY_RANK\s*=/);
  assert.match(appSource, /const\s+priorityDelta\s*=\s*getPriorityRank\(b\.priority\)\s*-\s*getPriorityRank\(a\.priority\)/);
  assert.match(appSource, /if\s*\(priorityDelta\s*!==\s*0\)\s*{\s*return\s+priorityDelta;\s*}/);
});

test("task rows show priority beside the title without adding a list column", () => {
  assert.match(htmlSource, /<span class="priority-pill"><\/span>/);
  assert.match(appSource, /const\s+priorityPill\s*=\s*item\.querySelector\("\.priority-pill"\)/);
  assert.match(appSource, /priorityPill\.textContent\s*=\s*priorityInfo\.label/);
  assert.match(cssSource, /\.task-title-line\s*{/);
  assert.match(cssSource, /\.priority-pill\.is-high\s*{/);
  assert.match(cssSource, /\.priority-pill\.is-low\s*{/);
});

test("expanded note rows use measured height instead of fixed row height", () => {
  assert.match(appSource, /function\s+getVisibleTaskListHeight\s*\(/);
  assert.match(appSource, /getBoundingClientRect\(\)\.height/);
  assert.doesNotMatch(appSource, /const\s+listHeight\s*=\s*visibleTaskCount\s*\*\s*rowHeight/);
  assert.match(cssSource, /\.task-list:has\(\.task-item\.is-note-open\)/);
  assert.match(cssSource, /\.task-item\.is-note-open\s*{/);
  assert.match(cssSource, /height:\s*auto/);
});

test("note editor opens and closes with a staged transition instead of a hard render", () => {
  assert.match(appSource, /const\s+NOTE_TRANSITION_MS\s*=/);
  assert.match(appSource, /function\s+openTaskNote\s*\(\s*task\s*,\s*item\s*\)/);
  assert.match(appSource, /function\s+closeTaskNote\s*\(\s*task\s*,\s*item\s*\)/);
  assert.match(appSource, /requestAnimationFrame\(\(\)\s*=>\s*{\s*nextItem\.classList\.add\("is-note-open"\)/);
  assert.match(appSource, /window\.setTimeout\(\(\)\s*=>\s*{[\s\S]*render\(\)[\s\S]*},\s*NOTE_TRANSITION_MS\)/);
  assert.match(cssSource, /\.note-row\s*{[\s\S]*max-height:\s*0/);
  assert.match(cssSource, /\.task-item\.is-note-open\s+\.note-row\s*{[\s\S]*max-height:\s*52px/);
  assert.match(cssSource, /transition:[\s\S]*max-height[\s\S]*opacity[\s\S]*transform/);
});
