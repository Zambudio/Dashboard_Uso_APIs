const urlInput = document.getElementById('dashboardUrl');
const saveBtn = document.getElementById('saveUrlBtn');
const openLink = document.getElementById('openDashboardLink');

const DEFAULT_DASHBOARD_URL = 'http://192.168.1.3:3000';

// Cargar URL guardada
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(['dashboard_url'], (res) => {
    const current = (res && res.dashboard_url) ? res.dashboard_url : DEFAULT_DASHBOARD_URL;
    urlInput.value = current;
    openLink.href = current;
  });
} else {
  urlInput.value = DEFAULT_DASHBOARD_URL;
  openLink.href = DEFAULT_DASHBOARD_URL;
}

saveBtn.addEventListener('click', () => {
  const newUrl = urlInput.value.trim().replace(/\/+$/, '');
  if (!newUrl) return;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ dashboard_url: newUrl }, () => {
      openLink.href = newUrl;
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status success';
      statusDiv.innerText = '✓ URL guardada: ' + newUrl;
    });
  }
});

document.getElementById('syncBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.className = 'status';
  statusDiv.innerText = 'Sincronizando...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusDiv.className = 'status error';
      statusDiv.innerText = 'No se encontró la pestaña activa';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'sync' }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.className = 'status error';
        statusDiv.innerText = 'Abre Claude, ChatGPT, Gemini o DeepSeek';
        return;
      }
      if (response && response.success) {
        statusDiv.className = 'status success';
        statusDiv.innerText = '¡Métricas enviadas con éxito!';
      } else {
        statusDiv.className = 'status error';
        statusDiv.innerText = 'No se pudieron extraer los datos';
      }
    });
  } catch (e) {
    statusDiv.className = 'status error';
    statusDiv.innerText = e.message || 'Error al comunicar con la pestaña';
  }
});
