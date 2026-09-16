/**
 * Content Script para Extensión de Navegador (Brave / Chrome / Edge)
 * Extrae automáticamente las dos barras y saldo de Claude, ChatGPT y Gemini.
 */

const DASHBOARD_ENDPOINT = 'http://localhost:3000/api/usage/sync';

async function extractAndSync(notify = false) {
  const url = window.location.href;
  let payload = null;

  try {
    // 1. CLAUDE
    if (url.includes('claude.ai')) {
      const orgsRes = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
      const orgs = await orgsRes.json();
      const orgId = Array.isArray(orgs) ? orgs[0]?.uuid : orgs?.uuid;
      if (!orgId) return;

      const usageRes = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: 'include' });
      const usage = await usageRes.json();

      let creditsSpent = undefined;
      const text = document.body.innerText || '';
      const creditMatch = text.match(/(EUR|USD|\$|€)?\s*(\d+(?:[.,]\d+)?)\s*(gastado|spent)/i);
      if (creditMatch) {
        creditsSpent = parseFloat(creditMatch[2].replace(',', '.'));
      }

      payload = {
        provider: 'claude-pro',
        providerId: 'claude-pro',
        sessionUtilization: usage.five_hour?.utilization,
        weeklyUtilization: usage.seven_day?.utilization,
        sessionResetsAt: usage.five_hour?.resets_at,
        weeklyResetsAt: usage.seven_day?.resets_at,
        accumulatedCost: creditsSpent,
        currency: 'EUR',
        planType: 'Claude Pro',
      };
    }
    // 2. CHATGPT
    else if (url.includes('chatgpt.com/settings/usage')) {
      const text = document.body.innerText || '';
      let sessionUtil = undefined;
      let sessionResets = undefined;
      const m5h = text.match(/5-hour limit[\s\S]*?(?:Resets in|Se restablece en)\s+([^\n\r]+)[\s\S]*?(\d+)\s*%\s*(restante|remaining|usado|used)/i);
      if (m5h) {
        sessionResets = m5h[1].trim();
        const num = parseInt(m5h[2], 10);
        sessionUtil = m5h[3].toLowerCase().startsWith('rest') || m5h[3].toLowerCase().startsWith('rem') ? 100 - num : num;
      }

      let weeklyUtil = undefined;
      let weeklyResets = undefined;
      const mWeek = text.match(/Weekly limit[\s\S]*?(?:Resets in|Se restablece en)\s+([^\n\r]+)[\s\S]*?(\d+)\s*%\s*(restante|remaining|usado|used)/i);
      if (mWeek) {
        weeklyResets = mWeek[1].trim();
        const num = parseInt(mWeek[2], 10);
        weeklyUtil = mWeek[3].toLowerCase().startsWith('rest') || mWeek[3].toLowerCase().startsWith('rem') ? 100 - num : num;
      }

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
    // 3. GEMINI
    else if (url.includes('gemini.google.com/usage')) {
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
    }

    if (!payload) return;

    // Enviar al Dashboard local
    await fetch(DASHBOARD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[Extension Dashboard] ✅ Datos sincronizados:', payload.provider);
  } catch (err) {
    console.warn('[Extension Dashboard] Sync warning:', err);
  }
}

// Ejecutar al cargar la página tras un pequeño delay para que cargue el DOM
setTimeout(() => {
  void extractAndSync();
}, 1500);

// Re-intentar a los 5 segundos por si el render tardó un poco
setTimeout(() => {
  void extractAndSync();
}, 5000);

// Responder a peticiones manuales desde el popup
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sync') {
      extractAndSync(true).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
  });
}
