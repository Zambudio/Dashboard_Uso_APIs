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

const VALID_THEMES = new Set(['aurora', 'esmeralda', 'ambar', 'violeta', 'mono']);

// Misma lógica que formatRelativeTime() en components/ProviderCard.tsx, para
// que el widget diga "3h"/"7d" igual que el dashboard web.
function formatRelativeTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffHours = (date.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours <= 0) return 'ya';
  if (diffHours < 1) return `${Math.round(diffHours * 60)} min`;
  if (diffHours < 48) return `${Math.round(diffHours)} h`;
  return `${Math.round(diffHours / 24)} d`;
}

function applyOpacity(preferences) {
  const pct = Math.min(100, Math.max(30, (preferences && preferences.widgetOpacity) || 92));
  document.body.style.background = `rgba(20, 20, 30, ${pct / 100})`;
}

function applyTheme(preferences) {
  const theme = preferences && VALID_THEMES.has(preferences.widgetTheme) ? preferences.widgetTheme : 'aurora';
  document.body.dataset.theme = theme;
}

// Mismo orden manual que app/page.tsx aplica en el dashboard web
// (preferences.sortOrder === 'default'): los ids listados en cardOrder van
// primero en ese orden, el resto conserva su orden original al final. Sin
// esto el widget siempre mostraba los proveedores en su orden de alta,
// ignorando el arrastre para reordenar del dashboard.
function applyCardOrder(providers, preferences) {
  const order = preferences && preferences.cardOrder;
  if (!order || !order.length) return providers;
  const indexOf = new Map(order.map((id, i) => [id, i]));
  return [...providers].sort((a, b) => {
    const ia = indexOf.has(a.id) ? indexOf.get(a.id) : Infinity;
    const ib = indexOf.has(b.id) ? indexOf.get(b.id) : Infinity;
    return ia - ib;
  });
}

function formatBalanceLine(usage) {
  if (!usage) return 'Sin datos todavía';
  if (usage.error) return usage.error;
  if (usage.balance !== undefined) return `${usage.balance.toFixed(2)} ${usage.currency || ''}`.trim();
  return 'Sin datos disponibles';
}

function buildBarRow(label, pct, resetIso, colorClass) {
  const wrap = document.createElement('div');
  wrap.className = 'bar-block';

  const row = document.createElement('div');
  row.className = 'row bar-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'bar-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'bar-value';
  const reset = formatRelativeTime(resetIso);
  valueEl.textContent = `${Math.round(pct)}%${reset ? ` · Reset ${reset}` : ''}`;
  row.append(labelEl, valueEl);

  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = `bar-fill ${colorClass}`;
  fill.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
  track.appendChild(fill);

  wrap.append(row, track);
  return wrap;
}

function buildCardBody(provider) {
  const usage = provider.usage;
  const body = document.createElement('div');
  body.className = 'card-body';

  if (usage && usage.error) {
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = usage.error;
    body.appendChild(value);
    return body;
  }

  const hasSession = usage && (usage.sessionUtilization !== undefined || usage.sessionResetsAt !== undefined);
  const isSubscriptionLayout =
    provider.kind === 'subscription' || (usage && (usage.sessionUtilization !== undefined || usage.weeklyUtilization !== undefined));

  if (isSubscriptionLayout) {
    if (hasSession) {
      body.appendChild(buildBarRow('Sesión', usage.sessionUtilization ?? 0, usage.sessionResetsAt, 'session'));
    }
    body.appendChild(buildBarRow('Semanal', (usage && usage.weeklyUtilization) ?? 0, usage && usage.weeklyResetsAt, 'weekly'));
  } else {
    const row = document.createElement('div');
    row.className = 'row';
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = formatBalanceLine(usage);
    row.appendChild(value);
    body.appendChild(row);
  }

  return body;
}

function renderProviders(providers, preferences) {
  cardsEl.innerHTML = '';
  const hiddenInWidget = new Set((preferences && preferences.widgetHiddenProviderIds) || []);
  const visible = applyCardOrder(
    (providers || []).filter((p) => p.visibility !== 'hidden' && !hiddenInWidget.has(p.id)),
    preferences
  );

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

      const header = document.createElement('div');
      header.className = 'row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = provider.name;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = STATUS_COLORS[provider.status] || STATUS_COLORS.unconfigured;
      header.append(name, dot);

      info.append(header, buildCardBody(provider));

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
  applyTheme(data.preferences);
  renderProviders(data.providers, data.preferences);
});
