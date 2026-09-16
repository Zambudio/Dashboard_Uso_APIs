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
        statusDiv.innerText = 'Abre Claude, ChatGPT o Gemini';
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
