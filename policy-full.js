const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authUser = document.querySelector("#authUser");
const authPass = document.querySelector("#authPass");
const authError = document.querySelector("#authError");
const authHash = "43adec346203b6c57fc3197a835f12683c8bffbeff3a88d8e38c8b7f396ae1e9";
const authStorageKey = "nonAutoInsuranceManualAuthenticated";

const manual = window.MANUAL_DATA;
const nav = document.querySelector("#policyNav");
const chapterGrid = document.querySelector("#chapterGrid");
const moduleGrid = document.querySelector("#moduleGrid");
const moduleIntro = document.querySelector("#moduleIntro");
const cardGrid = document.querySelector("#knowledgeGrid");
const searchInput = document.querySelector("#policySearch");
const filterBar = document.querySelector("#filterBar");
const cardCount = document.querySelector("#cardCount");
const printBtn = document.querySelector("#printBtn");
const resetBtn = document.querySelector("#resetBtn");
const backTopBtn = document.querySelector("#backTopBtn");
const navToggleBtn = document.querySelector("#navToggleBtn");
const manualSidebar = document.querySelector("#manualSidebar");
const modal = document.querySelector("#detailModal");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalTags = document.querySelector("#modalTags");
const modalBody = document.querySelector("#modalBody");
const modalClose = document.querySelector("#modalClose");
const prevCardBtn = document.querySelector("#prevCardBtn");
const nextCardBtn = document.querySelector("#nextCardBtn");

const filterDefs = [
  { id: "all", label: "全部" },
  { id: "鼓励承保", label: "鼓励承保" },
  { id: "禁止承保", label: "禁止承保" },
  { id: "谨慎承保", label: "谨慎承保" },
  { id: "核保要素", label: "核保要素" },
  { id: "承保条件", label: "承保条件" },
  { id: "保险责任", label: "保险责任" },
  { id: "再保合约", label: "再保合约" },
  { id: "管理指引", label: "管理指引" },
];

const state = {
  chapterId: "all",
  moduleId: "all",
  filter: "all",
  query: "",
  activeCardId: null,
};

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
  const digest = await sha256(`${authUser.value.trim()}:${authPass.value}`);
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

function stripMarker(title) {
  return title.replace(/^（[一二三四五六七八九十]+）\s*/, "").replace(/^[一二三四五六七八九十]+、\s*/, "");
}

const chapters = manual.chapters;
const modules = chapters.flatMap((chapter) => chapter.modules.map((module) => ({ ...module, chapter })));
const cards = modules.flatMap((module) =>
  module.cards.map((card) => ({
    ...card,
    module,
    chapter: module.chapter,
    searchText: `${card.title} ${card.summary} ${card.tags.join(" ")} ${card.blocks.map((block) => block.text).join(" ")}`,
  })),
);

function blockText(blocks) {
  return blocks.map((block) => block.text).join(" ");
}

function filteredModules() {
  return modules.filter((module) => state.chapterId === "all" || module.chapter.id === state.chapterId);
}

function filteredCards() {
  const query = state.query.trim().toLowerCase();
  return cards.filter((card) => {
    const chapterMatch = state.chapterId === "all" || card.chapter.id === state.chapterId;
    const moduleMatch = state.moduleId === "all" || card.module.id === state.moduleId;
    const filterMatch = state.filter === "all" || card.tags.includes(state.filter);
    const queryMatch = !query || card.searchText.toLowerCase().includes(query);
    return chapterMatch && moduleMatch && filterMatch && queryMatch;
  });
}

function highlighted(value) {
  const safe = escapeHtml(value);
  const query = state.query.trim();
  if (!query) return safe;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(escapedQuery, "gi"), (match) => `<mark>${match}</mark>`);
}

function tagClass(tag) {
  if (tag === "鼓励承保") return "tag-encourage";
  if (tag === "禁止承保") return "tag-forbid";
  if (tag === "谨慎承保") return "tag-caution";
  if (tag === "核保要素") return "tag-underwriting";
  if (tag === "承保条件") return "tag-condition";
  if (tag === "保险责任") return "tag-coverage";
  if (tag === "再保合约" || tag === "管理指引") return "tag-risk";
  return "";
}

function renderNav() {
  nav.innerHTML = chapters
    .map((chapter) => {
      const chapterModules = chapter.modules;
      return `
        <details class="nav-group" ${state.chapterId === chapter.id || state.chapterId === "all" ? "open" : ""}>
          <summary data-chapter="${chapter.id}">
            <span>${escapeHtml(chapter.title)}</span>
          </summary>
          <button class="nav-item ${state.chapterId === chapter.id && state.moduleId === "all" ? "active" : ""}" type="button" data-chapter="${chapter.id}" data-module="all">本章全部</button>
          ${chapterModules
            .map(
              (module) => `
              <button class="nav-item ${state.moduleId === module.id ? "active" : ""}" type="button" data-chapter="${chapter.id}" data-module="${module.id}">
                ${escapeHtml(module.title)}
              </button>
            `,
            )
            .join("")}
        </details>
      `;
    })
    .join("");
}

function renderChapterGrid() {
  const allActive = state.chapterId === "all";
  chapterGrid.innerHTML = `
    <button class="chapter-card ${allActive ? "active" : ""}" type="button" data-chapter="all">
      <strong>全部章节</strong>
      <span>${cards.length} 张主题卡片</span>
    </button>
    ${chapters
      .map((chapter) => {
        const count = cards.filter((card) => card.chapter.id === chapter.id).length;
        return `
          <button class="chapter-card ${state.chapterId === chapter.id ? "active" : ""}" type="button" data-chapter="${chapter.id}">
            <strong>${escapeHtml(chapter.title)}</strong>
            <span>${count} 张主题卡片</span>
          </button>
        `;
      })
      .join("")}
  `;
}

function renderModuleGrid() {
  const list = filteredModules();
  moduleGrid.innerHTML = `
    <button class="module-card ${state.moduleId === "all" ? "active" : ""}" type="button" data-module="all">
      <span>${state.chapterId === "all" ? "所有章节" : "当前章节"}</span>
      <strong>全部模块</strong>
      <em>${filteredCards().length} 张卡片</em>
    </button>
    ${list
      .map((module) => {
        const count = cards.filter((card) => card.module.id === module.id).length;
        return `
          <button class="module-card ${state.moduleId === module.id ? "active" : ""}" type="button" data-module="${module.id}">
            <span>${escapeHtml(module.chapter.title)}</span>
            <strong>${escapeHtml(module.title)}</strong>
            <em>${count} 张卡片</em>
          </button>
        `;
      })
      .join("")}
  `;
}

function renderFilters() {
  filterBar.innerHTML = filterDefs
    .map(
      (filter) =>
        `<button class="filter-chip ${state.filter === filter.id ? "active" : ""}" type="button" data-filter="${filter.id}">${filter.label}</button>`,
    )
    .join("");
}

function renderModuleIntro() {
  const module = modules.find((item) => item.id === state.moduleId);
  if (!module || !module.introBlocks.length) {
    moduleIntro.innerHTML = "";
    return;
  }
  moduleIntro.innerHTML = `
    <section class="module-intro">
      <h3>${escapeHtml(module.title)}：模块说明</h3>
      ${module.introBlocks.map((block) => renderBlock(block, true)).join("")}
    </section>
  `;
}

function renderCards() {
  const list = filteredCards();
  cardCount.textContent = list.length;
  cardGrid.innerHTML = list.length
    ? list
        .map(
          (card) => `
          <article class="knowledge-card" data-card="${card.id}">
            <div class="knowledge-card-top">
              <span>${escapeHtml(card.chapter.title)}</span>
              <em>${escapeHtml(card.module.title)}</em>
            </div>
            <h3>${highlighted(card.title)}</h3>
            <p>${highlighted(card.summary || "原文仅保留标题，已按原位置保留。")}</p>
            <div class="tag-row">
              ${
                card.tags.length
                  ? card.tags.map((tag) => `<span class="tag ${tagClass(tag)}">${tag}</span>`).join("")
                  : `<span class="tag">原文主题</span>`
              }
            </div>
            <div class="knowledge-card-foot">
              <span>原文 ${card.sourceLine}${card.blocks.length ? `-${card.blocks.at(-1).sourceLine}` : ""}</span>
              <strong>${card.blocks.length} 段</strong>
            </div>
          </article>
        `,
        )
        .join("")
    : `<div class="section no-results">没有找到匹配的主题卡片。</div>`;
}

function renderAll() {
  renderNav();
  renderChapterGrid();
  renderModuleGrid();
  renderFilters();
  renderModuleIntro();
  renderCards();
}

function renderBlock(block, compact = false) {
  const style = block.signals?.indent ? ` style="--indent:${Math.min(block.signals.indent, 72)}px"` : "";
  const content = highlighted(block.text);
  const lineAttr = `data-line="${block.sourceLine}"`;
  if (block.kind === "group") return `<h4 class="modal-subheading" ${lineAttr}>${content}</h4>`;
  if (block.kind === "subheading") return `<h4 class="modal-subheading" ${lineAttr}>${content}</h4>`;
  if (block.kind === "formula") return `<p class="formula" ${lineAttr}>${content}</p>`;
  if (block.kind === "warning") return `<p class="modal-risk danger" ${lineAttr}${style}>${content}</p>`;
  if (block.kind === "caution") return `<p class="modal-risk caution" ${lineAttr}${style}>${content}</p>`;
  if (block.kind === "positive") return `<p class="modal-risk encourage" ${lineAttr}${style}>${content}</p>`;
  if (block.kind === "list") return `<p class="manual-list-line ${compact ? "compact" : ""}" ${lineAttr}${style}>${content}</p>`;
  return `<p ${lineAttr}${style}>${content}</p>`;
}

function groupedBlocks(card) {
  const blocks = [];
  let current = null;
  for (const block of card.blocks) {
    if (block.kind === "subheading" || block.kind === "group") {
      current = { title: block.text, sourceLine: block.sourceLine, blocks: [] };
      blocks.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      if (!blocks.length || blocks.at(-1).title) blocks.push({ title: "", blocks: [] });
      blocks.at(-1).blocks.push(block);
    }
  }
  return blocks;
}

function openModal(cardId) {
  const card = cards.find((item) => item.id === cardId);
  if (!card) return;
  state.activeCardId = cardId;
  const list = filteredCards();
  const index = list.findIndex((item) => item.id === cardId);
  modalMeta.textContent = `${card.chapter.title} / ${card.module.title} · 原文 ${card.sourceLine}${card.blocks.length ? `-${card.blocks.at(-1).sourceLine}` : ""}`;
  modalTitle.innerHTML = highlighted(card.title);
  modalTags.innerHTML = card.tags.map((tag) => `<span class="tag ${tagClass(tag)}">${tag}</span>`).join("");
  if (card.blocks.length) {
    modalBody.innerHTML = groupedBlocks(card)
      .map((group) => {
        const title = group.title ? `<h3>${highlighted(group.title)}</h3>` : "";
        return `<section class="modal-block">${title}${group.blocks.map((block) => renderBlock(block)).join("")}</section>`;
      })
      .join("");
  } else {
    modalBody.innerHTML = `<section class="modal-block"><p class="muted">原文在此处仅保留标题，网页已按原章节位置保留该条目。</p></section>`;
  }
  prevCardBtn.disabled = index <= 0;
  nextCardBtn.disabled = index < 0 || index >= list.length - 1;
  modal.showModal();
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.close();
  document.body.classList.remove("modal-open");
}

function moveModal(direction) {
  const list = filteredCards();
  const index = list.findIndex((card) => card.id === state.activeCardId);
  const next = list[index + direction];
  if (next) openModal(next.id);
}

function resetFilters() {
  state.chapterId = "all";
  state.moduleId = "all";
  state.filter = "all";
  state.query = "";
  searchInput.value = "";
  renderAll();
}

document.body.classList.add("is-locked");
if (sessionStorage.getItem(authStorageKey) === "true") unlockPage();
else authUser.focus();

renderAll();

authForm.addEventListener("submit", checkLogin);
printBtn.addEventListener("click", () => window.print());
resetBtn.addEventListener("click", resetFilters);
backTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
navToggleBtn.addEventListener("click", () => manualSidebar.classList.toggle("is-open"));
searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderCards();
});
chapterGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chapter]");
  if (!button) return;
  state.chapterId = button.dataset.chapter;
  state.moduleId = "all";
  renderAll();
});
moduleGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (!button) return;
  state.moduleId = button.dataset.module;
  renderNav();
  renderModuleGrid();
  renderModuleIntro();
  renderCards();
});
filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  renderFilters();
  renderCards();
});
nav.addEventListener("click", (event) => {
  const target = event.target.closest("[data-chapter], [data-module]");
  if (!target) return;
  if (target.tagName === "SUMMARY") {
    state.chapterId = target.dataset.chapter;
    state.moduleId = "all";
  } else {
    state.chapterId = target.dataset.chapter || state.chapterId;
    state.moduleId = target.dataset.module || "all";
  }
  manualSidebar.classList.remove("is-open");
  renderAll();
});
cardGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-card]");
  if (card) openModal(card.dataset.card);
});
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
prevCardBtn.addEventListener("click", () => moveModal(-1));
nextCardBtn.addEventListener("click", () => moveModal(1));
