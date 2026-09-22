/**
 * Content Script para Extensión de Navegador (Brave / Chrome / Edge)
 * Extrae automáticamente métricas de Claude, ChatGPT, Gemini y DeepSeek.
 */

async function getDashboardEndpoint() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['dashboard_url'], (res) => {
        const base = (res && res.dashboard_url) ? res.dashboard_url.replace(/\/+$/, '') : 'http://192.168.1.3:3000';
        resolve(`${base}/api/usage/sync`);
      });
    } else {
      resolve('http://192.168.1.3:3000/api/usage/sync');
    }
  });
}

function normalizePercent(val) {
  if (val === undefined || val === null || isNaN(Number(val))) return undefined;
  const n = Number(val);
  if (n > 0 && n <= 1) return Math.round(n * 100);
  return Math.min(100, Math.max(0, Math.round(n)));
}

async function extractClaudeMetrics() {
  let sessionUtil = undefined;
  let weeklyUtil = undefined;
  let sessionResets = undefined;
  let weeklyResets = undefined;
  let creditsSpent = undefined;
  let balance = undefined;
  let currency = 'EUR';

  // 1. Intentar API interna
  try {
    const orgsRes = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    if (orgsRes.ok) {
      const orgs = await orgsRes.json();
      const orgId = Array.isArray(orgs) ? orgs[0]?.uuid : orgs?.uuid;
      if (orgId) {
        const usageRes = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: 'include' });
        if (usageRes.ok) {
          const usage = await usageRes.json();
          if (usage.five_hour?.utilization !== undefined) {
            sessionUtil = normalizePercent(usage.five_hour.utilization);
            sessionResets = usage.five_hour.resets_at;
          }
          if (usage.seven_day?.utilization !== undefined) {
            weeklyUtil = normalizePercent(usage.seven_day.utilization);
            weeklyResets = usage.seven_day.resets_at;
          }
        }
      }
    }
  } catch {}

  // 2. Fallback o complemento desde el DOM visible
  const text = document.body.innerText || '';

  // Sesión actual
  const mSession = text.match(/(?:Sesión actual|Current session)[\s\S]*?(?:Se restablece en|Resets in)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(usado|used|restante|remaining)/i);
  if (mSession) {
    if (!sessionResets) sessionResets = mSession[1].trim();
    if (sessionUtil === undefined) {
      const num = parseFloat(mSession[2].replace(',', '.'));
      sessionUtil = mSession[3].toLowerCase().startsWith('rest') || mSession[3].toLowerCase().startsWith('rem') ? Math.max(0, 100 - num) : num;
    }
  }

  // Límites semanales / Todos los modelos
  const mWeekly = text.match(/(?:Límites semanales|Weekly limit|Todos los modelos|All models)[\s\S]*?(?:Se restablece el|Se restablece en|Resets)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(usado|used|restante|remaining)/i);
  if (mWeekly) {
    if (!weeklyResets) weeklyResets = mWeekly[1].trim();
    if (weeklyUtil === undefined) {
      const num = parseFloat(mWeekly[2].replace(',', '.'));
      weeklyUtil = mWeekly[3].toLowerCase().startsWith('rest') || mWeekly[3].toLowerCase().startsWith('rem') ? Math.max(0, 100 - num) : num;
    }
  }

  // Créditos de uso
  const mSpent = text.match(/(EUR|USD|\$|€)?\s*(\d+(?:[.,]\d+)?)\s*(?:gastado|spent)/i);
  if (mSpent) {
    creditsSpent = parseFloat(mSpent[2].replace(',', '.'));
    if (mSpent[1] === '$' || mSpent[1] === 'USD') currency = 'USD';
  }

  const mBal = text.match(/(EUR|USD|\$|€)?\s*(\d+(?:[.,]\d+)?)\s*(?:Saldo actual|Current balance|créditos)/i);
  if (mBal) {
    balance = parseFloat(mBal[2].replace(',', '.'));
    if (mBal[1] === '$' || mBal[1] === 'USD') currency = 'USD';
  }

  if (sessionUtil === undefined && weeklyUtil === undefined && balance === undefined && creditsSpent === undefined) {
    return null;
  }

  return {
    provider: 'claude-pro',
    providerId: 'claude-pro',
    sessionUtilization: normalizePercent(sessionUtil),
    weeklyUtilization: normalizePercent(weeklyUtil),
    sessionResetsAt: sessionResets,
    weeklyResetsAt: weeklyResets,
    accumulatedCost: creditsSpent,
    balance,
    currency,
    planType: 'Claude Pro',
  };
}

async function extractChatGPTMetrics() {
  const text = document.body.innerText || '';

  // 5-hour limit
  let sessionUtil = undefined;
  let sessionResets = undefined;
  const m5h = text.match(/(?:5-hour limit|L[íi]mite de 5 horas|L[íi]mite de 3 horas|5 hours)[\s\S]*?(?:Resets in|Se restablece en|Resets at|Se restablece a las)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(restante|remaining|usado|used)/i);
  if (m5h) {
    sessionResets = m5h[1].trim();
    const num = parseFloat(m5h[2].replace(',', '.'));
    const isRemaining = m5h[3].toLowerCase().startsWith('rest') || m5h[3].toLowerCase().startsWith('rem');
    sessionUtil = isRemaining ? Math.max(0, 100 - num) : num;
  }

  // Weekly limit
  let weeklyUtil = undefined;
  let weeklyResets = undefined;
  const mWeek = text.match(/(?:Weekly limit|L[íi]mite semanal)[\s\S]*?(?:Resets in|Se restablece en|Resets at|Se restablece a las)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(restante|remaining|usado|used)/i);
  if (mWeek) {
    weeklyResets = mWeek[1].trim();
    const num = parseFloat(mWeek[2].replace(',', '.'));
    const isRemaining = mWeek[3].toLowerCase().startsWith('rest') || mWeek[3].toLowerCase().startsWith('rem');
    weeklyUtil = isRemaining ? Math.max(0, 100 - num) : num;
  }

  // Credits
  let credits = undefined;
  const mCred = text.match(/(\d+(?:[.,]\d+)?)\s*(?:credits? remaining|cr[ée]ditos? restantes|cr[ée]ditos?|Saldo actual)/i);
  if (mCred) {
    credits = parseFloat(mCred[1].replace(',', '.'));
  }

  if (sessionUtil === undefined && weeklyUtil === undefined && credits === undefined) {
    return null;
  }

  return {
    provider: 'openai',
    providerId: 'openai',
    sessionUtilization: normalizePercent(sessionUtil),
    weeklyUtilization: normalizePercent(weeklyUtil),
    sessionResetsAt: sessionResets,
    weeklyResetsAt: weeklyResets,
    balance: credits,
    currency: 'USD',
    planType: 'ChatGPT Plus / Team',
  };
}

async function extractGeminiMetrics() {
  const text = document.body.innerText || '';
  let sessionUtil = undefined;
  let sessionResets = undefined;
  let weeklyUtil = undefined;
  let weeklyResets = undefined;

  const mCur = text.match(/(?:Uso actual|Current usage|Five Hour Limit|Límite de 5 horas)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(?:usado|used|restante|remaining)[\s\S]*?(?:Se restablece|Resets|refresh in)\s+([^\n\r]+)/i);
  if (mCur) {
    const num = parseFloat(mCur[1].replace(',', '.'));
    sessionUtil = mCur[0].toLowerCase().includes('restante') || mCur[0].toLowerCase().includes('remaining') ? Math.max(0, 100 - num) : num;
    sessionResets = mCur[2].trim();
  }

  const mWeek = text.match(/(?:L[íi]mite semanal|Weekly limit|Weekly Limit Remaining)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(?:usado|used|restante|remaining)[\s\S]*?(?:Se restablece|Resets|refresh in)\s+([^\n\r]+)/i);
  if (mWeek) {
    const num = parseFloat(mWeek[1].replace(',', '.'));
    weeklyUtil = mWeek[0].toLowerCase().includes('restante') || mWeek[0].toLowerCase().includes('remaining') ? Math.max(0, 100 - num) : num;
    weeklyResets = mWeek[2].trim();
  }

  if (sessionUtil === undefined && weeklyUtil === undefined) {
    return null;
  }

  let detectedPlan = 'Google Gemini Pro';
  if (/ADVANCED/i.test(text)) detectedPlan = 'Google Gemini Advanced';
  if (/Google AI Pro/i.test(text)) detectedPlan = 'Google AI Pro';

  return {
    provider: 'gemini',
    providerId: 'gemini',
    sessionUtilization: normalizePercent(sessionUtil),
    weeklyUtilization: normalizePercent(weeklyUtil),
    sessionResetsAt: sessionResets,
    weeklyResetsAt: weeklyResets,
    planType: detectedPlan,
  };
}

async function extractDeepSeekMetrics() {
  const text = document.body.innerText || '';
  let balance = undefined;
  let cost = undefined;

  const mBalance = text.match(/(?:Topped-up balance|Saldo disponible|Saldo actual)[\s\S]*?([$¥€])\s*(\d+(?:[.,]\d+)?)/i);
  if (mBalance) {
    balance = parseFloat(mBalance[2].replace(',', '.'));
  }

  const mCost = text.match(/(?:Total spent|Coste total|Consumo total)[\s\S]*?([$¥€])\s*(\d+(?:[.,]\d+)?)/i);
  if (mCost) {
    cost = parseFloat(mCost[2].replace(',', '.'));
  }

  if (balance === undefined && cost === undefined) {
    return null;
  }

  return {
    provider: 'deepseek',
    providerId: 'deepseek',
    balance,
    accumulatedCost: cost,
    currency: 'USD',
    planType: 'DeepSeek Platform',
    tier: 'Pay-as-you-go',
  };
}

async function extractAndSync() {
  const url = window.location.href;
  let payload = null;

  try {
    if (url.includes('claude.ai')) {
      payload = await extractClaudeMetrics();
    } else if (url.includes('chatgpt.com')) {
      if (url.includes('/settings/usage')) {
        payload = await extractChatGPTMetrics();
      }
    } else if (url.includes('gemini.google.com')) {
      if (url.includes('/usage')) {
        payload = await extractGeminiMetrics();
      }
    } else if (url.includes('platform.deepseek.com')) {
      payload = await extractDeepSeekMetrics();
    }

    if (!payload) return;

    const endpoint = await getDashboardEndpoint();

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[Extension Dashboard] ✅ Datos sincronizados hacia ' + endpoint + ':', payload.provider);
  } catch (err) {
    console.warn('[Extension Dashboard] Sync warning:', err);
  }
}

// Ejecutar al cargar la página
setTimeout(() => void extractAndSync(), 1500);
setTimeout(() => void extractAndSync(), 4500);

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sync') {
      extractAndSync().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
  });
}
