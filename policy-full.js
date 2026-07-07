const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authUser = document.querySelector("#authUser");
const authPass = document.querySelector("#authPass");
const authError = document.querySelector("#authError");
const authHash = "43adec346203b6c57fc3197a835f12683c8bffbeff3a88d8e38c8b7f396ae1e9";
const authStorageKey = "nonAutoInsuranceManualAuthenticated";

const policy = window.POLICY_DOCUMENT;
const nav = document.querySelector("#policyNav");
const stats = document.querySelector("#policyStats");
const moduleGrid = document.querySelector("#moduleGrid");
const cardGrid = document.querySelector("#knowledgeGrid");
const searchInput = document.querySelector("#policySearch");
const filterBar = document.querySelector("#filterBar");
const printBtn = document.querySelector("#printBtn");
const expandAllBtn = document.querySelector("#expandAllBtn");
const collapseAllBtn = document.querySelector("#collapseAllBtn");
const backTopBtn = document.querySelector("#backTopBtn");
const modal = document.querySelector("#detailModal");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalTags = document.querySelector("#modalTags");
const modalBody = document.querySelector("#modalBody");
const modalClose = document.querySelector("#modalClose");

const state = {
  activeModuleId: "all",
  activeFilter: "all",
  query: "",
};

const filterDefs = [
  { id: "all", label: "全部" },
  { id: "encourage", label: "鼓励承保" },
  { id: "forbid", label: "禁止承保" },
  { id: "caution", label: "谨慎承保" },
  { id: "underwriting", label: "核保要素" },
  { id: "condition", label: "承保条件" },
  { id: "coverage", label: "责任范围" },
  { id: "risk", label: "风险管理" },
];

function unlockPage() {
  authGate.classList.add("is-unlocked");
  document.body.classList.remove("is-locked");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkLogin(event) {
  event.preventDefault();
  authError.textContent = "";
  const user = authUser.value.trim();
  const pass = authPass.value;
  const digest = await sha256(`${user}:${pass}`);
  if (digest === authHash) {
    sessionStorage.setItem(authStorageKey, "true");
    unlockPage();
    return;
  }
  authError.textContent = "账号或密码不正确，请重新输入。";
  authPass.value = "";
  authPass.focus();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildTree(sections) {
  const roots = [];
  const stack = [];
  sections.forEach((section) => {
    const node = { ...section, children: [], parent: null };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) {
      node.parent = stack[stack.length - 1];
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });
  return roots;
}

const roots = buildTree(policy.sections);
const nodeById = new Map();
function indexNodes(node) {
  nodeById.set(node.id, node);
  node.children.forEach(indexNodes);
}
roots.forEach(indexNodes);

function descendantLineCount(node) {
  return node.lineCount + node.children.reduce((sum, child) => sum + descendantLineCount(child), 0);
}

function collectDescendantLines(node) {
  const chunks = [{ node, lines: node.lines }];
  node.children.forEach((child) => chunks.push(...collectDescendantLines(child)));
  return chunks;
}

function nearest(node, predicate) {
  let current = node;
  while (current && !predicate(current)) current = current.parent;
  return current;
}

function chapterOf(node) {
  return nearest(node, (item) => item.level === 1) || roots[0];
}

function moduleOf(node) {
  return nearest(node, (item) => item.level === 2) || node;
}

function makeModules() {
  const modules = [];
  roots.forEach((root) => {
    root.children.forEach((chapter) => {
      chapter.children.forEach((module) => {
        if (module.level === 2) modules.push(module);
      });
    });
  });
  return modules;
}

function makeCards() {
  const cards = [];
  const pushCard = (node, options = {}) => {
    const module = moduleOf(node);
    const chapter = chapterOf(node);
    cards.push({
      node,
      module,
      chapter,
      overviewOnly: Boolean(options.overviewOnly),
      tags: inferTags(node, options),
      text: collectText(node, options),
      lineCount: options.overviewOnly ? node.lineCount : descendantLineCount(node),
    });
  };

  makeModules().forEach((module) => {
    let count = 0;
    if (module.lines.length) {
      pushCard(module, { overviewOnly: true });
      count += 1;
    }
    const walk = (node) => {
      if (node.level >= 3) {
        pushCard(node);
        count += 1;
      }
      node.children.forEach(walk);
    };
    module.children.forEach(walk);
    if (count === 0) pushCard(module);
  });
  return cards;
}

function collectText(node, options = {}) {
  const chunks = options.overviewOnly ? [{ node, lines: node.lines }] : collectDescendantLines(node);
  return chunks
    .map((chunk) => [chunk.node.title, ...chunk.lines.map((line) => line.text)].join(" "))
    .join(" ");
}

function inferTags(node, options = {}) {
  const text = `${node.title} ${collectText(node, options)}`;
  const tags = [];
  if (/鼓励承保|推荐|优质/.test(text)) tags.push("encourage");
  if (/禁止承保|拒保|不予承保|不得承保|原则上不承保/.test(text)) tags.push("forbid");
  if (/谨慎承保|严格控制|提醒|注意/.test(text)) tags.push("caution");
  if (/核保|上报|审批|承保前风险评估|承保方案/.test(text)) tags.push("underwriting");
  if (/承保条件|费率|免赔|保险费|保费/.test(text)) tags.push("condition");
  if (/保险责任|责任范围|赔偿限额|保险金额|保险期限|保险标的/.test(text)) tags.push("coverage");
  if (/风险|危险单位|查勘|管理|损失记录|赔付率|两率/.test(text)) tags.push("risk");
  return [...new Set(tags)];
}

function tagLabel(tagId) {
  return filterDefs.find((item) => item.id === tagId)?.label || tagId;
}

function summarize(card) {
  const chunks = card.overviewOnly ? [{ node: card.node, lines: card.node.lines }] : collectDescendantLines(card.node);
  const lines = chunks.flatMap((chunk) => chunk.lines.map((line) => line.text));
  const first = lines.find((line) => line.length > 8) || card.node.title;
  return first.length > 86 ? `${first.slice(0, 86)}...` : first;
}

const modules = makeModules();
const cards = makeCards();

function renderStats() {
  document.querySelector("#statSections").textContent = policy.sectionCount;
  document.querySelector("#statLines").textContent = policy.nonEmptyLineCount;
  document.querySelector("#statChars").textContent = Math.round(policy.sourceCharacterCount / 1000) + "k";
  stats.innerHTML = `
    <div><b>${policy.sectionCount}</b><span>结构章节</span></div>
    <div><b>${policy.nonEmptyLineCount}</b><span>原文非空行</span></div>
    <div><b>${cards.length}</b><span>知识卡片</span></div>
  `;
}

function renderNav() {
  nav.innerHTML = `
    <a class="nav-l0 ${state.activeModuleId === "all" ? "active" : ""}" href="#" data-module="all">全部模块</a>
    ${modules.map((module) => `<a class="nav-l2 ${state.activeModuleId === module.id ? "active" : ""}" href="#" data-module="${module.id}">${escapeHtml(module.title)}</a>`).join("")}
  `;
}

function renderModuleGrid() {
  moduleGrid.innerHTML = `
    <button class="module-card ${state.activeModuleId === "all" ? "active" : ""}" type="button" data-module="all">
      <span>全部内容</span>
      <strong>${cards.length}</strong>
      <em>三级知识点卡片</em>
    </button>
    ${modules.map((module) => {
      const count = cards.filter((card) => card.module.id === module.id).length;
      return `
        <button class="module-card ${state.activeModuleId === module.id ? "active" : ""}" type="button" data-module="${module.id}">
          <span>${escapeHtml(chapterOf(module).title)}</span>
          <strong>${escapeHtml(module.title)}</strong>
          <em>${count} 张知识点卡片</em>
        </button>
      `;
    }).join("")}
  `;
}

function renderFilters() {
  filterBar.innerHTML = filterDefs.map((filter) => `
    <button class="filter-chip ${state.activeFilter === filter.id ? "active" : ""}" type="button" data-filter="${filter.id}">${filter.label}</button>
  `).join("");
}

function filteredCards() {
  const query = state.query.trim().toLowerCase();
  return cards.filter((card) => {
    const moduleMatched = state.activeModuleId === "all" || card.module.id === state.activeModuleId;
    const filterMatched = state.activeFilter === "all" || card.tags.includes(state.activeFilter);
    const queryMatched = !query || card.text.toLowerCase().includes(query) || card.node.title.toLowerCase().includes(query);
    return moduleMatched && filterMatched && queryMatched;
  });
}

function renderCards() {
  const list = filteredCards();
  cardGrid.innerHTML = list.length
    ? list.map((card) => `
      <article class="knowledge-card" data-card="${card.node.id}">
        <div class="knowledge-card-top">
          <span>${escapeHtml(card.chapter.title)}</span>
          <em>${escapeHtml(card.module.title)}</em>
        </div>
        <h3>${escapeHtml(card.node.title)}</h3>
        <p>${escapeHtml(summarize(card))}</p>
        <div class="tag-row">
          ${card.tags.slice(0, 5).map((tag) => `<span class="tag tag-${tag}">${tagLabel(tag)}</span>`).join("") || `<span class="tag">原文条目</span>`}
        </div>
        <div class="knowledge-card-foot">
          <span>原文 ${card.node.sourceLine}-${card.node.endLine}</span>
          <strong>${card.lineCount} 行</strong>
        </div>
      </article>
    `).join("")
    : `<div class="section no-results">没有找到匹配的知识点卡片。</div>`;
  document.querySelector("#cardCount").textContent = list.length;
}

function renderLine(line) {
  const text = escapeHtml(line.text);
  if (/^[①②③④⑤⑥⑦⑧⑨⑩ⅰⅱⅲⅠⅡⅢ]/.test(line.text) || /^[(（]?[0-9]+[)）]/.test(line.text)) {
    return `<li data-line="${line.sourceLine}">${text}</li>`;
  }
  if (/^(年保险费|保险费|保费计算公式|保险费=|年保费=)/.test(line.text)) {
    return `<p class="formula" data-line="${line.sourceLine}">${text}</p>`;
  }
  if (/禁止承保|不予承保|拒保/.test(line.text)) {
    return `<p class="modal-risk danger" data-line="${line.sourceLine}">${text}</p>`;
  }
  if (/谨慎承保|严格控制/.test(line.text)) {
    return `<p class="modal-risk caution" data-line="${line.sourceLine}">${text}</p>`;
  }
  if (/鼓励承保|优质/.test(line.text)) {
    return `<p class="modal-risk encourage" data-line="${line.sourceLine}">${text}</p>`;
  }
  if (/：$/.test(line.text) && line.text.length < 36) {
    return `<h4 data-line="${line.sourceLine}">${text}</h4>`;
  }
  return `<p data-line="${line.sourceLine}">${text}</p>`;
}

function renderLineGroup(lines) {
  const html = [];
  let listOpen = false;
  for (const line of lines) {
    const isBullet = /^[①②③④⑤⑥⑦⑧⑨⑩ⅰⅱⅲⅠⅡⅢ]/.test(line.text) || /^[(（]?[0-9]+[)）]/.test(line.text);
    if (isBullet) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(renderLine(line));
    } else {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(renderLine(line));
    }
  }
  if (listOpen) html.push("</ul>");
  return html.join("");
}

function sectionKind(title) {
  if (/鼓励承保/.test(title)) return "encourage";
  if (/禁止承保|不予承保|拒保/.test(title)) return "danger";
  if (/谨慎承保|严格控制/.test(title)) return "caution";
  if (/保险标的|保险金额|赔偿限额|主要保险责任|承保条件|保险期限/.test(title)) return "info";
  if (/核保|管理指引|承保指引|风险评估|承保方案/.test(title)) return "risk";
  return "default";
}

function openModal(cardId) {
  const card = cards.find((item) => item.node.id === cardId);
  if (!card) return;
  const chunks = card.overviewOnly ? [{ node: card.node, lines: card.node.lines }] : collectDescendantLines(card.node);
  modalTitle.textContent = card.node.title;
  modalMeta.textContent = `${card.chapter.title} / ${card.module.title} · 原文 ${card.node.sourceLine}-${card.node.endLine} · ${card.lineCount} 行`;
  modalTags.innerHTML = card.tags.map((tag) => `<span class="tag tag-${tag}">${tagLabel(tag)}</span>`).join("");
  modalBody.innerHTML = chunks.map((chunk) => `
    <section class="modal-block modal-${sectionKind(chunk.node.title)}">
      <h3>${escapeHtml(chunk.node.title)}</h3>
      ${chunk.lines.length ? renderLineGroup(chunk.lines) : `<p class="muted">本条为原文目录节点，详细内容见其下级条目。</p>`}
    </section>
  `).join("");
  modal.showModal();
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.close();
  document.body.classList.remove("modal-open");
}

function renderAll() {
  renderStats();
  renderNav();
  renderModuleGrid();
  renderFilters();
  renderCards();
}

document.body.classList.add("is-locked");
if (sessionStorage.getItem(authStorageKey) === "true") unlockPage();
else authUser.focus();

renderAll();

authForm.addEventListener("submit", checkLogin);
printBtn.addEventListener("click", () => window.print());
expandAllBtn.textContent = "显示全部";
collapseAllBtn.textContent = "清空筛选";
expandAllBtn.addEventListener("click", () => {
  state.activeModuleId = "all";
  state.activeFilter = "all";
  state.query = "";
  searchInput.value = "";
  renderAll();
});
collapseAllBtn.addEventListener("click", () => {
  state.activeFilter = "all";
  state.query = "";
  searchInput.value = "";
  renderFilters();
  renderCards();
});
backTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderCards();
});
nav.addEventListener("click", (event) => {
  const link = event.target.closest("[data-module]");
  if (!link) return;
  event.preventDefault();
  state.activeModuleId = link.dataset.module;
  renderNav();
  renderModuleGrid();
  renderCards();
});
moduleGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (!button) return;
  state.activeModuleId = button.dataset.module;
  renderNav();
  renderModuleGrid();
  renderCards();
});
filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.activeFilter = button.dataset.filter;
  renderFilters();
  renderCards();
});
cardGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-card]");
  if (!card) return;
  openModal(card.dataset.card);
});
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
