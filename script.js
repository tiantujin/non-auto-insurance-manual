const searchInput = document.querySelector("#searchInput");
const searchableSections = [...document.querySelectorAll(".searchable")];
const navLinks = [...document.querySelectorAll(".sidebar a")];
const printBtn = document.querySelector("#printBtn");

const originalHtml = new Map(searchableSections.map((section) => [section, section.innerHTML]));

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
updateActiveNav();
