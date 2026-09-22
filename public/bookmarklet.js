/**
 * Dashboard Uso APIs - Bookmarklet / Console Scraper
 * Detecta si estás en Claude, ChatGPT, Gemini o DeepSeek y envía las métricas al Dashboard (Local o NAS).
 */
(async function syncWithDashboard() {
  let dashboardOrigin = 'http://192.168.1.3:3000';
  try {
    const scriptSrc = document.currentScript ? document.currentScript.src : '';
    if (scriptSrc) {
      const parsed = new URL(scriptSrc);
      const originParam = parsed.searchParams.get('origin');
      if (originParam) {
        dashboardOrigin = originParam.replace(/\/+$/, '');
      } else if (parsed.origin && !parsed.origin.includes('null')) {
        dashboardOrigin = parsed.origin;
      }
    } else if (window.__DASHBOARD_API_URL) {
      dashboardOrigin = window.__DASHBOARD_API_URL;
    } else {
      const stored = localStorage.getItem('__dashboard_api_url');
      if (stored) dashboardOrigin = stored;
    }
  } catch {}

  const DASHBOARD_ENDPOINT = `${dashboardOrigin}/api/usage/sync`;

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
    toast.style.backgroundColor = isError ? '#e11d48' : '#059669';

    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function normalizePercent(val) {
    if (val === undefined || val === null || isNaN(Number(val))) return undefined;
    const n = Number(val);
    if (n > 0 && n <= 1) return Math.round(n * 100);
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  try {
    const url = window.location.href;
    let payload = null;

    // 1. CLAUDE (claude.ai)
    if (url.includes('claude.ai')) {
      showToast('⏳ Extrayendo métricas de Claude...');
      let sessionUtil = undefined;
      let weeklyUtil = undefined;
      let sessionResets = undefined;
      let weeklyResets = undefined;
      let creditsSpent = undefined;
      let balance = undefined;
      let currency = 'EUR';

      // Intento 1: API de Claude
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

      // Intento 2: DOM de la página
      const text = document.body.innerText || '';
      const mSession = text.match(/(?:Sesión actual|Current session)[\s\S]*?(?:Se restablece en|Resets in)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(usado|used|restante|remaining)/i);
      if (mSession) {
        if (!sessionResets) sessionResets = mSession[1].trim();
        if (sessionUtil === undefined) {
          const num = parseFloat(mSession[2].replace(',', '.'));
          sessionUtil = mSession[3].toLowerCase().startsWith('rest') || mSession[3].toLowerCase().startsWith('rem') ? Math.max(0, 100 - num) : num;
        }
      }

      const mWeekly = text.match(/(?:Límites semanales|Weekly limit|Todos los modelos|All models)[\s\S]*?(?:Se restablece el|Se restablece en|Resets)\s+([^\n\r]+)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(usado|used|restante|remaining)/i);
      if (mWeekly) {
        if (!weeklyResets) weeklyResets = mWeekly[1].trim();
        if (weeklyUtil === undefined) {
          const num = parseFloat(mWeekly[2].replace(',', '.'));
          weeklyUtil = mWeekly[3].toLowerCase().startsWith('rest') || mWeekly[3].toLowerCase().startsWith('rem') ? Math.max(0, 100 - num) : num;
        }
      }

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

      payload = {
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
    // 2. CHATGPT (chatgpt.com)
    else if (url.includes('chatgpt.com')) {
      showToast('⏳ Extrayendo métricas de ChatGPT...');
      if (!url.includes('/settings/usage')) {
        showToast('⚠️ Abriendo página de uso de ChatGPT...', false);
        window.location.href = 'https://chatgpt.com/settings/usage';
        return;
      }

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

      payload = {
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

      let detectedPlan = 'Google Gemini Pro';
      if (/ADVANCED/i.test(text)) detectedPlan = 'Google Gemini Advanced';
      if (/Google AI Pro/i.test(text)) detectedPlan = 'Google AI Pro';

      payload = {
        provider: 'gemini',
        providerId: 'gemini',
        sessionUtilization: normalizePercent(sessionUtil),
        weeklyUtilization: normalizePercent(weeklyUtil),
        sessionResetsAt: sessionResets,
        weeklyResetsAt: weeklyResets,
        planType: detectedPlan,
      };
    }
    // 4. DEEPSEEK (platform.deepseek.com)
    else if (url.includes('platform.deepseek.com')) {
      showToast('⏳ Extrayendo métricas de DeepSeek...');
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

      payload = {
        provider: 'deepseek',
        providerId: 'deepseek',
        balance,
        accumulatedCost: cost,
        currency: 'USD',
        planType: 'DeepSeek Platform',
        tier: 'Pay-as-you-go',
      };
    } else {
      showToast('❌ Abre esta pestaña en Claude, ChatGPT, Gemini o DeepSeek para sincronizar', true);
      return;
    }

    if (!payload) {
      showToast('❌ No se pudieron leer las métricas en esta página', true);
      return;
    }

    // Enviar al Dashboard (Local o en el NAS)
    const res = await fetch(DASHBOARD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    showToast(`✅ ¡${payload.planType || payload.provider} sincronizado con el Dashboard!`);
  } catch (err) {
    console.error('[Dashboard Sync Error]', err);
    showToast(`❌ Error: ${err.message || 'Comprueba que el Dashboard está activo en ' + dashboardOrigin}`, true);
  }
})();
