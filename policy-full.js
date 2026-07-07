const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authUser = document.querySelector("#authUser");
const authPass = document.querySelector("#authPass");
const authError = document.querySelector("#authError");
const authHash = "43adec346203b6c57fc3197a835f12683c8bffbeff3a88d8e38c8b7f396ae1e9";
const authStorageKey = "nonAutoInsuranceManualAuthenticated";

const policy = window.POLICY_DOCUMENT;
const content = document.querySelector("#policyContent");
const nav = document.querySelector("#policyNav");
const stats = document.querySelector("#policyStats");
const searchInput = document.querySelector("#policySearch");
const printBtn = document.querySelector("#printBtn");
const expandAllBtn = document.querySelector("#expandAllBtn");
const collapseAllBtn = document.querySelector("#collapseAllBtn");

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
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function classifyLine(text) {
  if (/^[①②③④⑤⑥⑦⑧⑨⑩ⅰⅱⅲⅠⅡⅢ]/.test(text)) return "bullet";
  if (/^[(（]?[0-9]+[)）]/.test(text)) return "bullet";
  if (/^[-•●]/.test(text)) return "bullet";
  if (/^(年保险费|保险费|保费计算公式|保险费=|年保费=)/.test(text)) return "formula";
  if (/^(注意|说明|附注|原则上|禁止|谨慎|鼓励)/.test(text)) return "emphasis";
  if (/：$/.test(text) && text.length < 36) return "subline";
  return "paragraph";
}

function renderLine(line) {
  const text = escapeHtml(line.text);
  const type = classifyLine(line.text);
  if (type === "bullet") return `<li data-line="${line.sourceLine}">${text}</li>`;
  if (type === "formula") return `<p class="formula" data-line="${line.sourceLine}">${text}</p>`;
  if (type === "emphasis") return `<p class="manual-note-line" data-line="${line.sourceLine}">${text}</p>`;
  if (type === "subline") return `<h4 data-line="${line.sourceLine}">${text}</h4>`;
  return `<p data-line="${line.sourceLine}">${text}</p>`;
}

function renderLines(lines) {
  const html = [];
  let listOpen = false;
  for (const line of lines) {
    const type = classifyLine(line.text);
    if (type === "bullet") {
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

function levelLabel(level) {
  if (level <= 1) return "chapter";
  if (level === 2) return "line";
  if (level === 3) return "module";
  return "point";
}

function renderSections() {
  document.querySelector("#statSections").textContent = policy.sectionCount;
  document.querySelector("#statLines").textContent = policy.nonEmptyLineCount;
  document.querySelector("#statChars").textContent = Math.round(policy.sourceCharacterCount / 1000) + "k";
  stats.innerHTML = `
    <div><b>${policy.sectionCount}</b><span>结构章节</span></div>
    <div><b>${policy.nonEmptyLineCount}</b><span>原文非空行</span></div>
    <div><b>${policy.sourceCharacterCount.toLocaleString()}</b><span>字符</span></div>
  `;

  nav.innerHTML = policy.sections
    .filter((section) => section.level <= 3)
    .map((section) => `<a class="nav-l${section.level}" href="#${section.id}">${escapeHtml(section.title)}</a>`)
    .join("");

  content.innerHTML = policy.sections
    .map((section, index) => {
      const open = section.level <= 2 || index < 8 ? " open" : "";
      return `
        <details id="${section.id}" class="manual-section manual-l${section.level}" data-title="${escapeHtml(section.title)}" data-search="${escapeHtml([section.title, ...section.lines.map((line) => line.text)].join(" "))}"${open}>
          <summary>
            <span>
              <small>${levelLabel(section.level)} · 原文 ${section.sourceLine}-${section.endLine}</small>
              ${escapeHtml(section.title)}
            </span>
            <em>${section.lineCount} 行</em>
          </summary>
          <div class="manual-section-body">
            ${renderLines(section.lines)}
          </div>
        </details>
      `;
    })
    .join("");
}

function runSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const sections = [...document.querySelectorAll(".manual-section")];
  let matchCount = 0;
  document.querySelector("#noResults")?.remove();
  sections.forEach((section) => {
    section.querySelectorAll("mark").forEach((mark) => mark.replaceWith(mark.textContent));
    section.classList.remove("is-hidden");
    if (!query) return;
    const haystack = section.dataset.search.toLowerCase();
    const matched = haystack.includes(query);
    section.classList.toggle("is-hidden", !matched);
    if (matched) {
      matchCount += 1;
      section.open = true;
      highlight(section, query);
    }
  });
  content.classList.toggle("has-search", Boolean(query));
  if (query && matchCount === 0) {
    content.insertAdjacentHTML("afterbegin", `<div class="section no-results" id="noResults">没有找到“${escapeHtml(searchInput.value.trim())}”。</div>`);
  } else {
    document.querySelector("#noResults")?.remove();
  }
}

function highlight(root, query) {
  if (!query) return;
  const pattern = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!pattern.test(node.nodeValue)) return;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    node.nodeValue.split(pattern).forEach((part) => {
      if (part.toLowerCase() === query) {
        const mark = document.createElement("mark");
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(fragment, node);
  });
}

document.body.classList.add("is-locked");
if (sessionStorage.getItem(authStorageKey) === "true") {
  unlockPage();
} else {
  authUser.focus();
}

renderSections();
authForm.addEventListener("submit", checkLogin);
searchInput.addEventListener("input", runSearch);
printBtn.addEventListener("click", () => window.print());
expandAllBtn.addEventListener("click", () => document.querySelectorAll(".manual-section").forEach((section) => { section.open = true; }));
collapseAllBtn.addEventListener("click", () => document.querySelectorAll(".manual-section").forEach((section) => { section.open = section.classList.contains("manual-l0") || section.classList.contains("manual-l1"); }));
