/**
 * Dashboard Uso APIs - Bookmarklet / Console Scraper
 * Detecta si estás en Gemini, ChatGPT o Claude y envía las métricas al Dashboard local.
 */
(async function syncWithDashboard() {
  const DASHBOARD_ENDPOINT = 'http://localhost:3000/api/usage/sync';

  function showToast(message, isError = false) {
    const existing = document.getElementById('dashboard-sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'dashboard-sync-toast';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '9999999';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '12px';
    toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)';
    toast.style.transition = 'all 0.3s ease';
    toast.style.color = '#ffffff';

    if (isError) {
      toast.style.backgroundColor = '#e11d48';
    } else {
      toast.style.backgroundColor = '#059669';
    }

    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  try {
    const url = window.location.href;
    let payload = null;

    // 1. CLAUDE (claude.ai)
    if (url.includes('claude.ai')) {
      showToast('⏳ Extrayendo métricas de Claude...');
      try {
        const orgsRes = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
        const orgs = await orgsRes.json();
        const orgId = Array.isArray(orgs) ? orgs[0]?.uuid : orgs?.uuid;
        if (!orgId) throw new Error('No se encontró la organización de Claude');

        const usageRes = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: 'include' });
        const usage = await usageRes.json();

        // Créditos gastados si los hay en el DOM
        let creditsSpent = undefined;
        let currency = 'EUR';
        const pageText = document.body.innerText || '';
        const creditMatch = pageText.match(/(EUR|USD|\$|€)?\s*(\d+(?:[.,]\d+)?)\s*(gastado|spent)/i);
        if (creditMatch) {
          creditsSpent = parseFloat(creditMatch[2].replace(',', '.'));
          if (creditMatch[1] === '$' || creditMatch[1] === 'USD') currency = 'USD';
        }

        payload = {
          provider: 'claude-pro',
          providerId: 'claude-pro',
          sessionUtilization: usage.five_hour?.utilization,
          weeklyUtilization: usage.seven_day?.utilization,
          sessionResetsAt: usage.five_hour?.resets_at,
          weeklyResetsAt: usage.seven_day?.resets_at,
          accumulatedCost: creditsSpent,
          currency,
          planType: 'Claude Pro',
        };
      } catch (err) {
        throw new Error('No se pudo extraer el uso de Claude: ' + (err.message || err));
      }
    }
    // 2. CHATGPT (chatgpt.com)
    else if (url.includes('chatgpt.com')) {
      showToast('⏳ Extrayendo métricas de ChatGPT...');
      // Si no estamos en la página de uso, avisar
      if (!url.includes('/settings/usage')) {
        showToast('⚠️ Abriendo página de uso de ChatGPT...', false);
        window.location.href = 'https://chatgpt.com/settings/usage';
        return;
      }

      const text = document.body.innerText || '';
      // 5-hour limit
      let sessionUtil = undefined;
      let sessionResets = undefined;
      const m5h = text.match(/5-hour limit[\s\S]*?(?:Resets in|Se restablece en)\s+([^\n\r]+)[\s\S]*?(\d+)\s*%\s*(restante|remaining|usado|used)/i);
      if (m5h) {
        sessionResets = m5h[1].trim();
        const num = parseInt(m5h[2], 10);
        sessionUtil = m5h[3].toLowerCase().startsWith('rest') || m5h[3].toLowerCase().startsWith('rem') ? 100 - num : num;
      }

      // Weekly limit
      let weeklyUtil = undefined;
      let weeklyResets = undefined;
      const mWeek = text.match(/Weekly limit[\s\S]*?(?:Resets in|Se restablece en)\s+([^\n\r]+)[\s\S]*?(\d+)\s*%\s*(restante|remaining|usado|used)/i);
      if (mWeek) {
        weeklyResets = mWeek[1].trim();
        const num = parseInt(mWeek[2], 10);
        weeklyUtil = mWeek[3].toLowerCase().startsWith('rest') || mWeek[3].toLowerCase().startsWith('rem') ? 100 - num : num;
      }

      // Credits
      let credits = undefined;
      const mCred = text.match(/(\d+(?:[.,]\d+)?)\s*(?:credits? remaining|cr[ée]ditos?)/i);
      if (mCred) {
        credits = parseFloat(mCred[1].replace(',', '.'));
      }

      payload = {
        provider: 'openai',
        providerId: 'openai',
        sessionUtilization: sessionUtil,
        weeklyUtilization: weeklyUtil,
        sessionResetsAt: sessionResets,
        weeklyResetsAt: weeklyResets,
        balance: credits,
        currency: 'USD',
        planType: 'ChatGPT Plus / Team',
      };
    }
    // 3. GEMINI (gemini.google.com)
    else if (url.includes('gemini.google.com')) {
      showToast('⏳ Extrayendo métricas de Gemini...');
      if (!url.includes('/usage')) {
        showToast('⚠️ Abriendo página de límites de Gemini...', false);
        window.location.href = 'https://gemini.google.com/usage';
        return;
      }

      const text = document.body.innerText || '';
      let sessionUtil = undefined;
      let sessionResets = undefined;
      let weeklyUtil = undefined;
      let weeklyResets = undefined;

      const mCur = text.match(/Uso actual[\s\S]*?(\d+)\s*%\s*usado[\s\S]*?Se restablece\s+([^\n\r]+)/i);
      if (mCur) {
        sessionUtil = parseInt(mCur[1], 10);
        sessionResets = mCur[2].trim();
      }

      const mWeek = text.match(/L[íi]mite semanal[\s\S]*?(\d+)\s*%\s*usado[\s\S]*?Se restablece\s+([^\n\r]+)/i);
      if (mWeek) {
        weeklyUtil = parseInt(mWeek[1], 10);
        weeklyResets = mWeek[2].trim();
      }

      let detectedPlan = 'Google Gemini Pro';
      if (/ADVANCED/i.test(text)) detectedPlan = 'Google Gemini Advanced';

      payload = {
        provider: 'gemini',
        providerId: 'gemini',
        sessionUtilization: sessionUtil,
        weeklyUtilization: weeklyUtil,
        sessionResetsAt: sessionResets,
        weeklyResetsAt: weeklyResets,
        planType: detectedPlan,
      };
    } else {
      showToast('❌ Abre esta pestaña en Claude, ChatGPT o Gemini para sincronizar', true);
      return;
    }

    if (!payload) {
      showToast('❌ No se pudieron leer las métricas en esta página', true);
      return;
    }

    // Enviar al Dashboard
    const res = await fetch(DASHBOARD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    showToast(`✅ ¡${payload.planType || payload.provider} sincronizado con el Dashboard!`);
    console.log('[Dashboard Uso APIs] Sincronización completada:', data);
  } catch (err) {
    console.error('[Dashboard Sync Error]', err);
    showToast(`❌ Error: ${err.message || 'Comprueba que el Dashboard está abierto en localhost:3000'}`, true);
  }
})();
