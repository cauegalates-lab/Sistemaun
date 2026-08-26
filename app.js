const DEMO_USERS = {
  "vendedor@unifahe.com.br": {
    password: "123456",
    name: "Vendedor UNIFAHE",
    role: "vendedor"
  },
  "gestor@unifahe.com.br": {
    password: "123456",
    name: "Gestor UNIFAHE",
    role: "gestor"
  }
};

const COMMON_ITEMS = [
  { id: "inicio", label: "Início", icon: "house", section: "Principal" },
  { id: "vendas", label: "Vendas", icon: "shopping-bag", section: "Operação" },
  { id: "times", label: "Times", icon: "users-round", section: "Operação" },
  { id: "fca", label: "FCA", icon: "clipboard-check", section: "Operação" },
  { id: "campanhas", label: "Campanhas", icon: "megaphone", section: "Operação" }
];

const SELLER_DASHBOARDS = [
  { id: "dashboard-vendedor", label: "Dashboard vendedor", icon: "chart-column", section: "Dashboards" }
];

const MANAGER_DASHBOARDS = [
  { id: "dashboard-vendedor", label: "Dashboard vendedor", icon: "chart-column", section: "Dashboards" },
  { id: "dashboard-geral", label: "Dashboard geral", icon: "chart-pie", section: "Dashboards" }
];

const PAGE_COPY = {
  vendas: ["Vendas", "Área preparada para lançamento, consulta e acompanhamento das vendas."],
  times: ["Times", "Área preparada para estrutura, ranking e acompanhamento dos times."],
  fca: ["FCA", "Área preparada para os indicadores e rotinas de FCA."],
  campanhas: ["Campanhas", "Área preparada para campanhas, metas e ações comerciais."],
  "dashboard-vendedor": ["Dashboard vendedor", "Visão individual de desempenho do vendedor."],
  "dashboard-geral": ["Dashboard geral", "Visão consolidada do desempenho comercial para gestão."]
};

let currentUser = null;
let currentPage = "inicio";

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const sidebar = document.getElementById("sidebar");
const sidebarNav = document.getElementById("sidebarNav");
const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
const userName = document.getElementById("userName");
const userRole = document.getElementById("userRole");
const userAvatar = document.getElementById("userAvatar");
const mobileOverlay = document.getElementById("mobileOverlay");

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function init() {
  const savedSidebar = localStorage.getItem("unifaheSidebarCollapsed") === "1";
  if (savedSidebar) sidebar.classList.add("is-collapsed");
  setTimeout(refreshIcons, 0);
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const user = DEMO_USERS[email];

  if (!user || user.password !== password) {
    loginError.textContent = "E-mail ou senha inválidos para o acesso de demonstração.";
    return;
  }

  loginError.textContent = "";
  signIn(user);
});

document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    const role = button.dataset.demo;
    const email = role === "gestor" ? "gestor@unifahe.com.br" : "vendedor@unifahe.com.br";
    emailInput.value = email;
    passwordInput.value = "123456";
    emailInput.focus();
  });
});

document.getElementById("togglePassword").addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  document.getElementById("togglePassword").innerHTML = `<i data-lucide="${isPassword ? "eye-off" : "eye"}"></i>`;
  refreshIcons();
});

document.getElementById("sidebarToggle").addEventListener("click", () => {
  sidebar.classList.toggle("is-collapsed");
  localStorage.setItem("unifaheSidebarCollapsed", sidebar.classList.contains("is-collapsed") ? "1" : "0");
});

document.getElementById("mobileMenuButton").addEventListener("click", openMobileMenu);
mobileOverlay.addEventListener("click", closeMobileMenu);
document.getElementById("logoutButton").addEventListener("click", signOut);

function signIn(user) {
  currentUser = user;
  currentPage = "inicio";
  userName.textContent = user.name;
  userRole.textContent = user.role === "gestor" ? "Gestor" : "Vendedor";
  userAvatar.textContent = user.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  loginView.classList.add("is-hidden");
  appView.classList.remove("is-hidden");
  buildMenu();
  renderPage("inicio");
  setTimeout(refreshIcons, 0);
}

function signOut() {
  currentUser = null;
  currentPage = "inicio";
  appView.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
  passwordInput.value = "";
  closeMobileMenu();
  setTimeout(refreshIcons, 0);
}

function getMenuItems() {
  if (!currentUser) return [];
  const dashboards = currentUser.role === "gestor" ? MANAGER_DASHBOARDS : SELLER_DASHBOARDS;
  return [...COMMON_ITEMS, ...dashboards];
}

function buildMenu() {
  const items = getMenuItems();
  sidebarNav.innerHTML = "";
  let activeSection = null;

  items.forEach((item) => {
    if (item.section !== activeSection) {
      activeSection = item.section;
      const sectionLabel = document.createElement("div");
      sectionLabel.className = "nav-section-label";
      sectionLabel.textContent = activeSection;
      sidebarNav.appendChild(sectionLabel);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-item${item.id === currentPage ? " active" : ""}`;
    button.dataset.page = item.id;
    button.innerHTML = `
      <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>
      <span class="nav-label">${item.label}</span>
    `;
    button.addEventListener("click", () => {
      renderPage(item.id);
      closeMobileMenu();
    });
    sidebarNav.appendChild(button);
  });

  refreshIcons();
}

function renderPage(pageId) {
  currentPage = pageId;
  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageId);
  });

  if (pageId === "inicio") {
    pageTitle.textContent = "Início";
    renderHome();
    return;
  }

  const [title, description] = PAGE_COPY[pageId] || ["Módulo", "Estrutura pronta para receber conteúdo."];
  pageTitle.textContent = title;
  const template = document.getElementById("blankTemplate").content.cloneNode(true);
  template.getElementById("blankTitle").textContent = title;
  template.getElementById("blankDescription").textContent = description;
  content.replaceChildren(template);
  refreshIcons();
}

function renderHome() {
  const template = document.getElementById("homeTemplate").content.cloneNode(true);
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date());
  template.getElementById("todayText").textContent = date.charAt(0).toUpperCase() + date.slice(1);

  const quickLinks = template.getElementById("quickLinks");
  const favoriteIds = currentUser.role === "gestor"
    ? ["vendas", "times", "campanhas", "dashboard-geral"]
    : ["vendas", "times", "campanhas", "dashboard-vendedor"];

  const available = getMenuItems();
  favoriteIds.forEach((id) => {
    const item = available.find((entry) => entry.id === id);
    if (!item) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-link";
    button.innerHTML = `
      <span class="quick-icon"><i data-lucide="${item.icon}"></i></span>
      <strong>${item.label}</strong>
      <span><i data-lucide="arrow-up-right"></i></span>
    `;
    button.addEventListener("click", () => renderPage(item.id));
    quickLinks.appendChild(button);
  });

  content.replaceChildren(template);
  refreshIcons();
}

function openMobileMenu() {
  sidebar.classList.add("mobile-open");
  mobileOverlay.classList.add("visible");
}

function closeMobileMenu() {
  sidebar.classList.remove("mobile-open");
  mobileOverlay.classList.remove("visible");
}

init();
