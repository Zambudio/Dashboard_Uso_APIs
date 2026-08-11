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

function formatUsageLine(usage) {
  if (!usage) return 'Sin datos todavía';
  if (usage.error) return usage.error;
  if (usage.weeklyUtilization !== undefined) return `${Math.round(usage.weeklyUtilization)}% semanal`;
  if (usage.sessionUtilization !== undefined) return `${Math.round(usage.sessionUtilization)}% sesión`;
  if (usage.balance !== undefined) return `${usage.balance.toFixed(2)} ${usage.currency || ''}`.trim();
  return 'Sin datos disponibles';
}

function renderProviders(providers) {
  cardsEl.innerHTML = '';
  const visible = (providers || []).filter((p) => p.visibility !== 'hidden');

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay proveedores configurados todavía.';
    cardsEl.appendChild(empty);
  } else {
    visible.forEach((provider) => {
      const card = document.createElement('div');
      card.className = 'card';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = STATUS_COLORS[provider.status] || STATUS_COLORS.unconfigured;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = provider.name;

      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatUsageLine(provider.usage);

      // El diseño aprobado especifica que un clic en una tarjeta abre esa
      // integración en el dashboard completo para reconectar/ajustar. La
      // web no tiene hoy un deep-link a una tarjeta concreta, así que abre
      // el dashboard general — el usuario localiza la tarjeta desde ahí.
      card.append(dot, name, value);
      card.addEventListener('click', () => window.widgetAPI.openDashboard());
      cardsEl.appendChild(card);
    });
  }

  requestAnimationFrame(() => {
    window.widgetAPI.resize(document.body.scrollHeight);
  });
}

window.widgetAPI.onUsageUpdate((data) => renderProviders(data.providers));
