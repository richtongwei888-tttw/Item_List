const STORAGE_KEY = "item-list.tasks.v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const FILTER_SWITCH_MS = 120;
const COMPLETION_EXIT_MS = 860;
const COMPLETION_COLLAPSE_DELAY_MS = 340;
const NOTE_TRANSITION_MS = 260;
const COMPACT_LIST_QUERY = "(max-width: 720px)";
const MAX_VISIBLE_TASKS = 11;
const PRIORITY_META = {
  low: { label: "低", tone: "low" },
  normal: { label: "普通", tone: "normal" },
  high: { label: "高", tone: "high" },
};
const PRIORITY_RANK = {
  low: 0,
  normal: 1,
  high: 2,
};

const elements = {
  form: document.querySelector("#taskForm"),
  titleInput: document.querySelector("#taskTitle"),
  dueInput: document.querySelector("#dueDate"),
  priorityInput: document.querySelector('[name="priority"]:checked'),
  formMessage: document.querySelector("#formMessage"),
  todayLabel: document.querySelector("#todayLabel"),
  focusOpenCount: document.querySelector("#focusOpenCount"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  totalCount: document.querySelector("#totalCount"),
  openCount: document.querySelector("#openCount"),
  doneCount: document.querySelector("#doneCount"),
  urgentCount: document.querySelector("#urgentCount"),
  listTitle: document.querySelector("#listTitle"),
  listSection: document.querySelector(".list-section"),
  taskList: document.querySelector("#taskList"),
  emptyState: document.querySelector("#emptyState"),
  template: document.querySelector("#taskTemplate"),
  segmented: document.querySelector(".segmented"),
  filterButtons: document.querySelectorAll("[data-filter]"),
};

const state = {
  tasks: loadTasks(),
  filter: "open",
  activeNoteId: null,
};

let filterSwitchTimer = null;

function getTaskRowHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--task-row-height")) || 76;
}

function getVisibleTaskListHeight({ taskCountDelta = 0 } = {}) {
  const rowHeight = getTaskRowHeight();
  const taskItems = [...elements.taskList.children];
  const taskCount = Math.max(elements.taskList.children.length + taskCountDelta, 0);
  const visibleTaskCount = Math.min(taskCount, MAX_VISIBLE_TASKS);
  const visibleItems = taskItems.slice(0, visibleTaskCount);
  const measuredHeight = visibleItems.reduce((total, item) => {
    const visibleRowHeight = item.classList.contains("is-note-closing")
      ? rowHeight
      : item.classList.contains("is-note-open")
      ? Math.max(item.getBoundingClientRect().height, item.scrollHeight)
      : item.getBoundingClientRect().height;

    return total + visibleRowHeight;
  }, 0);

  return measuredHeight || visibleTaskCount * rowHeight;
}

function syncListSectionHeight({ taskCountDelta = 0 } = {}) {
  if (window.matchMedia(COMPACT_LIST_QUERY).matches) {
    elements.listSection.style.height = "";
    elements.taskList.style.height = "";
    return;
  }

  const header = elements.listSection.querySelector(".list-sticky-header");
  const headerHeight = header.getBoundingClientRect().height;

  if (elements.emptyState.hidden) {
    const listHeight = getVisibleTaskListHeight({ taskCountDelta });
    elements.taskList.style.height = `${Math.ceil(listHeight)}px`;
    elements.listSection.style.height = `${Math.ceil(headerHeight + listHeight)}px`;
    return;
  }

  elements.taskList.style.height = "";
  const emptyHeight = elements.emptyState.getBoundingClientRect().height;
  const targetHeight = Math.min(headerHeight + emptyHeight, window.innerHeight - 30);
  elements.listSection.style.height = `${Math.ceil(targetHeight)}px`;
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseDateOnly(value));
}

function getDaysUntil(value) {
  return Math.round((parseDateOnly(value) - todayStart()) / DAY_MS);
}

function normalizePriority(priority) {
  return Object.hasOwn(PRIORITY_META, priority) ? priority : "normal";
}

function getPriorityInfo(priority) {
  return PRIORITY_META[normalizePriority(priority)];
}

function getPriorityRank(priority) {
  return PRIORITY_RANK[normalizePriority(priority)];
}

function getDueBadge(task) {
  if (task.completed) {
    return { text: "已完成", tone: "done" };
  }

  const days = getDaysUntil(task.dueDate);

  if (days < 0) {
    return { text: `逾期 ${Math.abs(days)} 天`, tone: "overdue" };
  }

  if (days === 0) {
    return { text: "今天截止", tone: "today" };
  }

  if (days <= 3) {
    return { text: `还剩 ${days} 天`, tone: "soon" };
  }

  return { text: `还剩 ${days} 天`, tone: "normal" };
}

function getUrgencyClass(task) {
  if (task.completed) {
    return "";
  }

  const days = getDaysUntil(task.dueDate);

  if (days < 0) {
    return "is-overdue";
  }

  if (days === 0) {
    return "is-due-today";
  }

  if (days === 1) {
    return "is-due-tomorrow";
  }

  if (days <= 3) {
    return "is-due-soon";
  }

  return "";
}

function createTask(title, dueDate, priority = "normal") {
  return {
    id: `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`,
    title,
    dueDate,
    priority: normalizePriority(priority),
    note: "",
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return Number(a.completed) - Number(b.completed);
    }

    if (a.completed) {
      return new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt);
    }

    const dueDelta = parseDateOnly(a.dueDate).getTime() - parseDateOnly(b.dueDate).getTime();
    if (dueDelta !== 0) {
      return dueDelta;
    }

    const priorityDelta = getPriorityRank(b.priority) - getPriorityRank(a.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function getFilteredTasks() {
  if (state.filter === "open") {
    return state.tasks.filter((task) => !task.completed);
  }

  if (state.filter === "done") {
    return state.tasks.filter((task) => task.completed);
  }

  return state.tasks;
}

function updateSummary() {
  const openTasks = state.tasks.filter((task) => !task.completed);
  const doneTasks = state.tasks.filter((task) => task.completed);
  const totalTasks = state.tasks.length;
  const progress = totalTasks === 0 ? 0 : Math.round((doneTasks.length / totalTasks) * 100);
  const urgentTasks = openTasks.filter((task) => {
    const days = getDaysUntil(task.dueDate);
    return days >= 0 && days <= 3;
  });

  elements.focusOpenCount.textContent = openTasks.length;
  elements.progressText.textContent = `${progress}% 完成`;
  elements.progressBar.style.width = `${progress}%`;
  elements.totalCount.textContent = `${totalTasks} 项`;
  elements.openCount.textContent = openTasks.length;
  elements.doneCount.textContent = doneTasks.length;
  elements.urgentCount.textContent = urgentTasks.length;
}

function updateFilterTabs() {
  elements.segmented.dataset.active = state.filter;

  elements.filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  const titles = {
    open: "未完成事项",
    done: "已完成事项",
    all: "全部事项",
  };

  elements.listTitle.textContent = titles[state.filter];
}

function renderTasks({ animateItems = false } = {}) {
  const tasks = sortTasks(getFilteredTasks());
  elements.taskList.innerHTML = "";
  elements.taskList.classList.toggle("is-entering", animateItems);
  elements.emptyState.hidden = tasks.length > 0;

  if (tasks.length === 0) {
    const emptyCopy = {
      open: ["没有未完成事项", "添加一条事项后，它会出现在这张工作清单里。"],
      done: ["还没有已完成事项", "完成事项后，可以在这里回看处理记录。"],
      all: ["这里还没有事项", "添加第一条事项，开始整理你的清单。"],
    };
    const [title, copy] = emptyCopy[state.filter];
    elements.emptyState.querySelector("strong").textContent = title;
    elements.emptyState.querySelector("p").textContent = copy;
    return;
  }

  const fragment = document.createDocumentFragment();

  tasks.forEach((task, index) => {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    const statusButton = item.querySelector(".status-button");
    const title = item.querySelector(".task-title");
    const priorityPill = item.querySelector(".priority-pill");
    const badge = item.querySelector(".due-badge");
    const date = item.querySelector(".date-text");
    const noteRow = item.querySelector(".note-row");
    const noteInput = item.querySelector(".note-input");
    const badgeInfo = getDueBadge(task);
    const priorityInfo = getPriorityInfo(task.priority);
    const isActiveNote = state.activeNoteId === task.id;

    item.dataset.id = task.id;
    item.dataset.priority = normalizePriority(task.priority);
    item.style.setProperty("--item-delay", `${Math.min(index, 8) * 24}ms`);
    item.classList.toggle("is-completed", task.completed);
    const urgencyClass = getUrgencyClass(task);
    if (urgencyClass) {
      item.classList.add(urgencyClass);
    }
    statusButton.textContent = task.completed ? "✓" : "";
    statusButton.title = task.completed ? "恢复为未完成" : "标记完成";
    statusButton.setAttribute("aria-label", task.completed ? "恢复为未完成" : "标记完成");
    title.textContent = task.title;
    priorityPill.textContent = priorityInfo.label;
    priorityPill.className = `priority-pill is-${priorityInfo.tone}`;
    badge.textContent = badgeInfo.text;
    badge.className = `due-badge is-${badgeInfo.tone}`;
    date.textContent = `截止：${formatDate(task.dueDate)}`;
    date.dateTime = task.dueDate;
    noteInput.value = task.note || "";
    noteRow.hidden = false;
    noteInput.tabIndex = isActiveNote ? 0 : -1;

    fragment.appendChild(item);
  });

  elements.taskList.appendChild(fragment);
}

function render() {
  elements.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  updateSummary();
  updateFilterTabs();
  renderTasks();
  syncListSectionHeight();
}

function switchFilter(nextFilter) {
  if (!nextFilter || nextFilter === state.filter) {
    return;
  }

  window.clearTimeout(filterSwitchTimer);
  elements.taskList.classList.add("is-switching");
  elements.emptyState.classList.add("is-switching");
  state.filter = nextFilter;
  updateFilterTabs();

  filterSwitchTimer = window.setTimeout(() => {
    renderTasks({ animateItems: true });
    syncListSectionHeight();
    requestAnimationFrame(() => {
      elements.taskList.classList.remove("is-switching");
      elements.emptyState.classList.remove("is-switching");
      window.setTimeout(() => {
        elements.taskList.classList.remove("is-entering");
      }, 320);
    });
  }, FILTER_SWITCH_MS);
}

function showMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("is-error", isError);
}

function syncCompletionListHeight(task, item) {
  if (state.filter !== "open") {
    return;
  }

  const expectedFilter = state.filter;
  window.setTimeout(() => {
    if (state.filter !== expectedFilter || !item.isConnected || task.completed) {
      return;
    }

    syncListSectionHeight({ taskCountDelta: -1 });
  }, COMPLETION_COLLAPSE_DELAY_MS);
}

function findTaskItem(taskId) {
  return document.querySelector(`[data-id="${taskId}"]`);
}

function openTaskNote(task, item) {
  if (item?.classList.contains("is-note-open")) {
    closeTaskNote(task, item);
    return;
  }

  state.activeNoteId = task.id;
  render();

  const nextItem = findTaskItem(task.id);
  if (!nextItem) {
    return;
  }

  syncListSectionHeight();
  requestAnimationFrame(() => {
    nextItem.classList.add("is-note-open");
    syncListSectionHeight();
    requestAnimationFrame(() => {
      nextItem.querySelector(".note-input")?.focus();
    });
  });

  window.setTimeout(syncListSectionHeight, NOTE_TRANSITION_MS);
}

function closeTaskNote(task, item) {
  item.classList.add("is-note-closing");
  item.classList.remove("is-note-open");
  syncListSectionHeight();

  window.setTimeout(() => {
    state.activeNoteId = null;
    saveTasks();
    render();
  }, NOTE_TRANSITION_MS);
}

function completeTaskWithAnimation(task, item, button) {
  if (item.classList.contains("is-completing")) {
    return;
  }

  item.classList.add("is-completing");
  elements.taskList.classList.add("is-completing-task");
  syncCompletionListHeight(task, item);
  button.disabled = true;
  button.setAttribute("aria-label", "正在标记完成");

  if (state.activeNoteId === task.id) {
    state.activeNoteId = null;
  }

  window.setTimeout(() => {
    task.completed = true;
    task.completedAt = new Date().toISOString();
    showMessage("已移入已完成事项。");
    saveTasks();
    render();
    elements.taskList.classList.remove("is-completing-task");
  }, COMPLETION_EXIT_MS);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = elements.titleInput.value.trim();
  const dueDate = elements.dueInput.value;
  const priority = document.querySelector('[name="priority"]:checked')?.value || "normal";

  if (!title || !dueDate) {
    showMessage("请填写事项内容和截止日期。", true);
    return;
  }

  state.tasks.push(createTask(title, dueDate, priority));
  state.filter = "open";
  saveTasks();
  elements.form.reset();
  elements.titleInput.focus();
  showMessage("已添加事项。");
  render();
});

elements.taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  const item = event.target.closest("[data-id]");

  if (!item) {
    return;
  }

  const task = state.tasks.find((current) => current.id === item.dataset.id);

  if (!task) {
    return;
  }

  if (!button && !event.target.closest(".note-input")) {
    openTaskNote(task, item);
    return;
  }

  if (!button) {
    return;
  }

  if (button.dataset.action === "toggle") {
    if (!task.completed) {
      completeTaskWithAnimation(task, item, button);
      return;
    }

    task.completed = false;
    task.completedAt = null;
    showMessage("已恢复为未完成事项。");
  }

  if (button.dataset.action === "delete") {
    state.tasks = state.tasks.filter((current) => current.id !== task.id);
    if (state.activeNoteId === task.id) {
      state.activeNoteId = null;
    }
    showMessage("已删除事项。");
  }

  saveTasks();
  render();
});

elements.taskList.addEventListener("input", (event) => {
  const noteInput = event.target.closest(".note-input");
  if (!noteInput) {
    return;
  }

  const item = noteInput.closest("[data-id]");
  const task = state.tasks.find((current) => current.id === item.dataset.id);

  if (!task) {
    return;
  }

  task.note = noteInput.value;
  state.activeNoteId = task.id;
  saveTasks();
});

elements.taskList.addEventListener(
  "blur",
  (event) => {
    const noteInput = event.target.closest(".note-input");
    if (!noteInput) {
      return;
    }

    const item = noteInput.closest("[data-id]");
    const task = state.tasks.find((current) => current.id === item.dataset.id);

    if (!task) {
      return;
    }

    task.note = noteInput.value.trim();
    if (state.activeNoteId === task.id) {
      closeTaskNote(task, item);
      return;
    }

    saveTasks();
  },
  true,
);

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchFilter(button.dataset.filter);
  });
});

window.addEventListener("resize", syncListSectionHeight);

render();
