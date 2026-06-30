const searchInput = document.querySelector("#searchInput");
const searchableSections = [...document.querySelectorAll(".searchable")];
const navLinks = [...document.querySelectorAll(".sidebar a")];
const printBtn = document.querySelector("#printBtn");
const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authUser = document.querySelector("#authUser");
const authPass = document.querySelector("#authPass");
const authError = document.querySelector("#authError");
const authHash = "43adec346203b6c57fc3197a835f12683c8bffbeff3a88d8e38c8b7f396ae1e9";
const authStorageKey = "nonAutoInsuranceManualAuthenticated";

const originalHtml = new Map(searchableSections.map((section) => [section, section.innerHTML]));

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

document.body.classList.add("is-locked");
if (sessionStorage.getItem(authStorageKey) === "true") {
  unlockPage();
} else {
  authUser.focus();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clearHighlights(section) {
  section.innerHTML = originalHtml.get(section);
}

function highlight(section, query) {
  const pattern = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    if (!pattern.test(node.nodeValue)) return;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    node.nodeValue.split(pattern).forEach((part) => {
      if (part.toLowerCase() === query.toLowerCase()) {
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

function runSearch() {
  const query = searchInput.value.trim();
  searchableSections.forEach((section) => {
    clearHighlights(section);
    section.classList.remove("is-hidden");
    if (!query) return;
    const text = section.textContent.toLowerCase();
    const matched = text.includes(query.toLowerCase());
    section.classList.toggle("is-hidden", !matched);
    if (matched) highlight(section, query);
  });
}

function updateActiveNav() {
  const visible = searchableSections.filter((section) => !section.classList.contains("is-hidden"));
  const current = visible.findLast((section) => section.getBoundingClientRect().top < 140);
  if (!current || !current.id) return;
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
  });
}

searchInput.addEventListener("input", runSearch);
window.addEventListener("scroll", updateActiveNav, { passive: true });
printBtn.addEventListener("click", () => window.print());
authForm.addEventListener("submit", checkLogin);
updateActiveNav();
