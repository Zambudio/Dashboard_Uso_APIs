'use strict';

const cardsEl = document.getElementById('cards');
const openBtn = document.getElementById('open-dashboard');
const collapseBtn = document.getElementById('toggle-collapse');

openBtn.addEventListener('click', () => window.widgetAPI.openDashboard());

// Estado de colapsado persistido en localStorage del propio renderer (no
// necesita pasar por electron-store: solo afecta a esta ventana y no hace
// falta compartirlo con el proceso principal).
function applyCollapsed(collapsed) {
  document.body.classList.toggle('collapsed', collapsed);
  collapseBtn.textContent = collapsed ? '▸' : '▾';
  requestAnimationFrame(() => window.widgetAPI.resize(document.body.scrollHeight));
}

let collapsed = localStorage.getItem('widgetCollapsed') === '1';
applyCollapsed(collapsed);

collapseBtn.addEventListener('click', () => {
  collapsed = !collapsed;
  localStorage.setItem('widgetCollapsed', collapsed ? '1' : '0');
  applyCollapsed(collapsed);
});

window.widgetAPI.onServerStatus((status) => {
  document.body.classList.toggle('server-down', Boolean(status && status.down));
});

const STATUS_COLORS = {
  online: '#10b981',
  warning: '#f59e0b',
  offline: '#f43f5e',
  error: '#f43f5e',
  unconfigured: '#64748b',
};

// Mismo mapeo id->logo que components/ProviderLogo.tsx en el dashboard web.
const LOGO_SRC = {
  openai: 'logos/openai.png',
  anthropic: 'logos/claude.png',
  'claude-pro': 'logos/claude.png',
  gemini: 'logos/gemini.png',
  deepseek: 'logos/deepseek.png',
};

function formatUsageLine(usage) {
  if (!usage) return 'Sin datos todavía';
  if (usage.error) return usage.error;
  if (usage.weeklyUtilization !== undefined) return `${Math.round(usage.weeklyUtilization)}% semanal`;
  if (usage.sessionUtilization !== undefined) return `${Math.round(usage.sessionUtilization)}% sesión`;
  if (usage.balance !== undefined) return `${usage.balance.toFixed(2)} ${usage.currency || ''}`.trim();
  return 'Sin datos disponibles';
}

// Misma lógica que formatRelativeTime() en components/ProviderCard.tsx, para
// que el widget diga "en 3h"/"en 7d" igual que el dashboard web.
function formatResetIn(usage) {
  const iso = usage && (usage.sessionResetsAt || usage.weeklyResetsAt);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffHours = (date.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours <= 0) return 'Reset: ya';
  if (diffHours < 1) return `Reset: ${Math.round(diffHours * 60)} min`;
  if (diffHours < 48) return `Reset: ${Math.round(diffHours)} h`;
  return `Reset: ${Math.round(diffHours / 24)} d`;
}

function applyOpacity(preferences) {
  const pct = Math.min(100, Math.max(30, (preferences && preferences.widgetOpacity) || 92));
  document.body.style.background = `rgba(20, 20, 30, ${pct / 100})`;
}

function renderProviders(providers, preferences) {
  cardsEl.innerHTML = '';
  const hiddenInWidget = new Set((preferences && preferences.widgetHiddenProviderIds) || []);
  const visible = (providers || []).filter((p) => p.visibility !== 'hidden' && !hiddenInWidget.has(p.id));

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay proveedores configurados todavía.';
    cardsEl.appendChild(empty);
  } else {
    visible.forEach((provider) => {
      const card = document.createElement('div');
      card.className = 'card';

      const logoSrc = LOGO_SRC[provider.provider];
      const logo = document.createElement('img');
      logo.className = 'logo';
      logo.alt = '';
      if (logoSrc) {
        logo.src = logoSrc;
        logo.onerror = () => { logo.style.visibility = 'hidden'; };
      } else {
        logo.style.visibility = 'hidden';
      }

      const info = document.createElement('div');
      info.className = 'info';

      const row1 = document.createElement('div');
      row1.className = 'row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = provider.name;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = STATUS_COLORS[provider.status] || STATUS_COLORS.unconfigured;
      row1.append(name, dot);

      const row2 = document.createElement('div');
      row2.className = 'row';
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatUsageLine(provider.usage);
      row2.appendChild(value);

      const resetLabel = formatResetIn(provider.usage);
      if (resetLabel) {
        const reset = document.createElement('span');
        reset.className = 'reset';
        reset.textContent = resetLabel;
        row2.appendChild(reset);
      }

      info.append(row1, row2);

      // El diseño aprobado especifica que un clic en una tarjeta abre esa
      // integración en el dashboard completo para reconectar/ajustar. La
      // web no tiene hoy un deep-link a una tarjeta concreta, así que abre
      // el dashboard general — el usuario localiza la tarjeta desde ahí.
      card.append(logo, info);
      card.addEventListener('click', () => window.widgetAPI.openDashboard());
      cardsEl.appendChild(card);
    });
  }

  requestAnimationFrame(() => {
    window.widgetAPI.resize(document.body.scrollHeight);
  });
}

window.widgetAPI.onUsageUpdate((data) => {
  applyOpacity(data.preferences);
  renderProviders(data.providers, data.preferences);
});
