const STORAGE_KEY = "item-list.tasks.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const elements = {
  form: document.querySelector("#taskForm"),
  titleInput: document.querySelector("#taskTitle"),
  dueInput: document.querySelector("#dueDate"),
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
  taskList: document.querySelector("#taskList"),
  emptyState: document.querySelector("#emptyState"),
  template: document.querySelector("#taskTemplate"),
  filterButtons: document.querySelectorAll("[data-filter]"),
};

const state = {
  tasks: loadTasks(),
  filter: "open",
  activeNoteId: null,
};

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

function createTask(title, dueDate) {
  return {
    id: `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`,
    title,
    dueDate,
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

function renderTasks() {
  const tasks = sortTasks(getFilteredTasks());
  elements.taskList.innerHTML = "";
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

  tasks.forEach((task) => {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    const statusButton = item.querySelector(".status-button");
    const title = item.querySelector(".task-title");
    const badge = item.querySelector(".due-badge");
    const date = item.querySelector(".date-text");
    const noteRow = item.querySelector(".note-row");
    const noteInput = item.querySelector(".note-input");
    const badgeInfo = getDueBadge(task);

    item.dataset.id = task.id;
    item.classList.toggle("is-completed", task.completed);
    const urgencyClass = getUrgencyClass(task);
    if (urgencyClass) {
      item.classList.add(urgencyClass);
    }
    statusButton.textContent = task.completed ? "✓" : "";
    statusButton.title = task.completed ? "恢复为未完成" : "标记完成";
    statusButton.setAttribute("aria-label", task.completed ? "恢复为未完成" : "标记完成");
    title.textContent = task.title;
    badge.textContent = badgeInfo.text;
    badge.className = `due-badge is-${badgeInfo.tone}`;
    date.textContent = `截止：${formatDate(task.dueDate)}`;
    date.dateTime = task.dueDate;
    noteInput.value = task.note || "";
    noteRow.hidden = state.activeNoteId !== task.id && !task.note;

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
}

function showMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("is-error", isError);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = elements.titleInput.value.trim();
  const dueDate = elements.dueInput.value;

  if (!title || !dueDate) {
    showMessage("请填写事项内容和截止日期。", true);
    return;
  }

  state.tasks.push(createTask(title, dueDate));
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
    state.activeNoteId = task.id;
    render();
    requestAnimationFrame(() => {
      document.querySelector(`[data-id="${task.id}"] .note-input`)?.focus();
    });
    return;
  }

  if (!button) {
    return;
  }

  if (button.dataset.action === "toggle") {
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    showMessage(task.completed ? "已移入已完成事项。" : "已恢复为未完成事项。");
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
    if (!task.note && state.activeNoteId === task.id) {
      state.activeNoteId = null;
      saveTasks();
      render();
      return;
    }

    saveTasks();
  },
  true,
);

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    render();
  });
});

render();
