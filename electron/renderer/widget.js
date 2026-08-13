'use strict';

const cardsEl = document.getElementById('cards');
const openBtn = document.getElementById('open-dashboard');
const collapseBtn = document.getElementById('toggle-collapse');
const minimizeBtn = document.getElementById('widget-minimize');
const closeBtn = document.getElementById('widget-close');
const settingsBtn = document.getElementById('widget-settings');
const hiddenCountBtn = document.getElementById('hidden-count');
const hiddenPanelEl = document.getElementById('hidden-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsForm = document.getElementById('settings-form');
const settingsCloseBtn = document.getElementById('settings-close');
const settingsCancelBtn = document.getElementById('settings-cancel');
const settingsStatus = document.getElementById('settings-status');
const themeInput = document.getElementById('setting-theme');
const opacityInput = document.getElementById('setting-opacity');
const opacityValue = document.getElementById('opacity-value');
const refreshInput = document.getElementById('setting-refresh');
const alwaysOnTopInput = document.getElementById('setting-always-on-top');
const openAtLoginInput = document.getElementById('setting-open-at-login');
const settingsProviders = document.getElementById('settings-providers');

openBtn.addEventListener('click', () => window.widgetAPI.openDashboard());
minimizeBtn.addEventListener('click', () => window.widgetAPI.minimize());
closeBtn.addEventListener('click', () => window.widgetAPI.close());

// Última foto recibida del proceso principal: se necesita fuera del
// callback de onUsageUpdate para poder re-renderizar de forma optimista
// (ocultar/mostrar una tarjeta) sin esperar al siguiente ciclo de sondeo.
let lastProviders = [];
let lastPreferences = {};
let hiddenPanelOpen = false;

function setProviderHidden(id, hidden) {
  const current = new Set(lastPreferences.widgetHiddenProviderIds || []);
  if (hidden) current.add(id);
  else current.delete(id);
  lastPreferences = { ...lastPreferences, widgetHiddenProviderIds: Array.from(current) };
  renderProviders(lastProviders, lastPreferences);
  window.widgetAPI.setProviderHidden(id, hidden);
}

hiddenCountBtn.addEventListener('click', () => {
  hiddenPanelOpen = !hiddenPanelOpen;
  renderProviders(lastProviders, lastPreferences);
});

function applyCollapsed(collapsed) {
  document.body.classList.toggle('collapsed', collapsed);
  collapseBtn.textContent = collapsed ? '▸' : '▾';
  collapseBtn.setAttribute('aria-label', collapsed ? 'Expandir widget' : 'Colapsar widget');
  requestAnimationFrame(() => window.widgetAPI.resize(document.body.scrollHeight));
}

let collapsed = false;
applyCollapsed(collapsed);

window.widgetAPI.getSettings().then((settings) => {
  collapsed = Boolean(settings.collapsed);
  applyCollapsed(collapsed);
}).catch(() => {});

collapseBtn.addEventListener('click', () => {
  collapsed = !collapsed;
  applyCollapsed(collapsed);
  window.widgetAPI.setCollapsed(collapsed).catch(() => {});
});

function resizeToContent() {
  requestAnimationFrame(() => window.widgetAPI.resize(document.body.scrollHeight));
}

function closeSettings() {
  settingsOverlay.hidden = true;
  document.body.classList.remove('settings-open');
  settingsStatus.textContent = '';
  resizeToContent();
  settingsBtn.focus();
}

function renderSettingsProviders() {
  const hidden = new Set(lastPreferences.widgetHiddenProviderIds || []);
  settingsProviders.replaceChildren();
  lastProviders.forEach((provider) => {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.providerId = provider.id;
    input.checked = !hidden.has(provider.id);
    const text = document.createElement('span');
    text.textContent = provider.name;
    label.append(input, text);
    settingsProviders.appendChild(label);
  });
}

async function openSettings() {
  settingsStatus.textContent = '';
  themeInput.value = VALID_THEMES.has(lastPreferences.widgetTheme) ? lastPreferences.widgetTheme : 'aurora';
  opacityInput.value = String(lastPreferences.widgetOpacity || 92);
  opacityValue.value = `${opacityInput.value}%`;
  refreshInput.value = String(lastPreferences.refreshWidgetSeconds || 300);
  renderSettingsProviders();
  try {
    const nativeSettings = await window.widgetAPI.getSettings();
    alwaysOnTopInput.checked = nativeSettings.alwaysOnTop !== false;
    openAtLoginInput.checked = Boolean(nativeSettings.openAtLogin);
  } catch {
    settingsStatus.textContent = 'No se pudieron leer los ajustes del sistema.';
  }
  settingsOverlay.hidden = false;
  document.body.classList.add('settings-open');
  resizeToContent();
  themeInput.focus();
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsCancelBtn.addEventListener('click', closeSettings);
opacityInput.addEventListener('input', () => { opacityValue.value = `${opacityInput.value}%`; });

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  settingsStatus.textContent = 'Guardando…';
  const hiddenIds = Array.from(settingsProviders.querySelectorAll('input[data-provider-id]'))
    .filter((input) => !input.checked)
    .map((input) => input.dataset.providerId);
  try {
    const result = await window.widgetAPI.saveSettings({
      widgetTheme: themeInput.value,
      widgetOpacity: Number(opacityInput.value),
      refreshWidgetSeconds: Number(refreshInput.value),
      widgetHiddenProviderIds: hiddenIds,
      alwaysOnTop: alwaysOnTopInput.checked,
      openAtLogin: openAtLoginInput.checked,
    });
    lastPreferences = result.preferences;
    applyOpacity(lastPreferences);
    applyTheme(lastPreferences);
    renderProviders(lastProviders, lastPreferences);
    closeSettings();
  } catch (error) {
    settingsStatus.textContent = error instanceof Error ? error.message : 'No se pudo guardar la configuraciÃ³n.';
  }
});

settingsOverlay.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSettings();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(settingsOverlay.querySelectorAll('button, input, select')).filter((item) => !item.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
  const all = providers || [];
  const visible = applyCardOrder(
    all.filter((p) => p.visibility !== 'hidden' && !hiddenInWidget.has(p.id)),
    preferences
  );
  // Solo se ofrecen para "volver a mostrar" los ocultados desde el propio
  // widget — los ocultados desde la web (provider.visibility === 'hidden')
  // siguen sin aparecer aquí ni en ningún sitio del widget, a propósito
  // (mismo comportamiento que ya tenía antes de este panel).
  const hiddenByWidget = all.filter((p) => p.visibility !== 'hidden' && hiddenInWidget.has(p.id));

  if (hiddenByWidget.length === 0) hiddenPanelOpen = false;
  hiddenCountBtn.hidden = hiddenByWidget.length === 0;
  hiddenCountBtn.textContent = `${hiddenByWidget.length} oculto${hiddenByWidget.length === 1 ? '' : 's'}`;
  hiddenCountBtn.classList.toggle('open', hiddenPanelOpen);

  hiddenPanelEl.innerHTML = '';
  hiddenPanelEl.classList.toggle('open', hiddenPanelOpen && hiddenByWidget.length > 0);
  if (hiddenPanelOpen) {
    hiddenByWidget.forEach((provider) => {
      const row = document.createElement('div');
      row.className = 'hidden-row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = provider.name;
      const showBtn = document.createElement('button');
      showBtn.type = 'button';
      showBtn.textContent = 'Mostrar';
      showBtn.setAttribute('aria-label', `Mostrar ${provider.name} en el widget`);
      showBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        setProviderHidden(provider.id, false);
      });
      row.append(name, showBtn);
      hiddenPanelEl.appendChild(row);
    });
  }

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
      const hideBtn = document.createElement('button');
      hideBtn.className = 'card-hide-btn';
      hideBtn.type = 'button';
      hideBtn.textContent = '✕';
      hideBtn.title = 'Ocultar en el widget';
      hideBtn.setAttribute('aria-label', `Ocultar ${provider.name} en el widget`);
      hideBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        setProviderHidden(provider.id, true);
      });
      header.append(name, dot, hideBtn);

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
  lastProviders = data.providers || [];
  lastPreferences = data.preferences || {};
  applyOpacity(lastPreferences);
  applyTheme(lastPreferences);
  renderProviders(lastProviders, lastPreferences);
});
