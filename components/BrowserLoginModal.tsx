'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiProviderConfig, ApiUsageSnapshot } from '@/types/api';
import { getProviderDefinition } from '@/lib/providers';
import { ProviderLogo } from './ProviderLogo';

interface BrowserLoginModalProps {
  provider: ApiProviderConfig;
  onSuccess: (providerId: string, snapshot: ApiUsageSnapshot, secret?: string) => void;
  onClose: () => void;
}

interface PollStatusResponse {
  status: 'starting' | 'waiting_user_login' | 'extracting' | 'completed' | 'cancelled' | 'error';
  statusMessage: string;
  usageSnapshot?: ApiUsageSnapshot;
  error?: string;
}

export function BrowserLoginModal({ provider, onSuccess, onClose }: BrowserLoginModalProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'starting' | 'waiting_user_login' | 'extracting' | 'completed' | 'cancelled' | 'error'>('starting');
  const [statusMessage, setStatusMessage] = useState('Iniciando ventana de navegador...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);

  const isMountedRef = useRef(true);
  const hasStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const definition = getProviderDefinition(provider.provider);

  useEffect(() => {
    isMountedRef.current = true;

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;

      // Start session
      fetch('/api/auth/browser-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          providerId: provider.id,
          provider: provider.provider,
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el navegador');
          sessionIdRef.current = data.sessionId;
          if (isMountedRef.current) {
            setSessionId(data.sessionId);
            setStatus('waiting_user_login');
            setStatusMessage('Ventana de navegador abierta. Inicia sesión con tu cuenta...');
          }
        })
        .catch((err) => {
          if (isMountedRef.current) {
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : 'Error al conectar con el navegador');
          }
        });
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [provider.id, provider.provider]);

  // Polling loop
  useEffect(() => {
    const currentSessionId = sessionId || sessionIdRef.current;
    if (!currentSessionId || status === 'completed' || status === 'cancelled') {
      return;
    }

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/auth/browser-login?sessionId=${encodeURIComponent(currentSessionId)}`);
        if (!res.ok || !active) return;

        const data: PollStatusResponse = await res.json();
        if (data.status) {
          setStatus(data.status);
        }
        if (data.statusMessage) {
          setStatusMessage(data.statusMessage);
        }

        if (data.status === 'completed' && data.usageSnapshot) {
          active = false;
          clearInterval(interval);
          setTimeout(() => {
            onSuccess(provider.id, data.usageSnapshot!, data.secret);
          }, 500);
        } else if (data.status === 'error') {
          setErrorMsg(data.error || data.statusMessage || 'Error durante la autenticación');
          clearInterval(interval);
        } else if (data.status === 'cancelled') {
          clearInterval(interval);
          setTimeout(() => {
            onClose();
          }, 500);
        }
      } catch {
        // ignore polling network errors
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId, status, provider.id, onSuccess, onClose]);

  const handleForceCheck = async () => {
    const currentSessionId = sessionId || sessionIdRef.current;
    if (!currentSessionId || checkingNow) return;
    setCheckingNow(true);
    setStatusMessage('Comprobando sesión en la ventana abierta...');
    try {
      const res = await fetch('/api/auth/browser-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_check', sessionId: currentSessionId }),
      });
      const data: PollStatusResponse = await res.json();
      if (data.status === 'completed' && data.usageSnapshot) {
        setStatus('completed');
        setStatusMessage(data.statusMessage || '¡Sesión detectada y datos obtenidos!');
        setTimeout(() => {
          onSuccess(provider.id, data.usageSnapshot!, data.secret);
        }, 500);
      }
    } catch {
      // ignore
    } finally {
      setCheckingNow(false);
    }
  };

  const handleCancel = async () => {
    if (sessionId) {
      void fetch('/api/auth/browser-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', sessionId }),
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#14141e] p-6 shadow-2xl shadow-cyan-500/10">
        <div className="flex items-center gap-4">
          <ProviderLogo provider={provider.provider} size="lg" />
          <div>
            <h2 className="text-xl font-bold text-white">Iniciar sesión en {definition.label}</h2>
            <p className="text-xs text-slate-400">Autenticación interactiva y captura automática de consumo</p>
          </div>
        </div>

        <div className="my-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-3">
            {status === 'completed' ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white font-bold text-sm">
                ✓
              </span>
            ) : status === 'error' ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white font-bold text-sm">
                ✕
              </span>
            ) : (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            )}
            <p className="text-sm font-medium text-white">{statusMessage}</p>
          </div>

          <div className="mt-4 space-y-2 text-xs text-slate-300">
            <div className="flex items-start gap-2">
              <span className="text-cyan-400 font-bold">1.</span>
              <span>Se ha abierto una ventana de Chromium en tu pantalla de Windows.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-cyan-400 font-bold">2.</span>
              <span>Inicia sesión con tu cuenta como siempre (email, Google, passkey).</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-cyan-400 font-bold">3.</span>
              <span>Al iniciar sesión, extraeremos tus datos de consumo automáticamente y cerraremos la ventana.</span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <p className="font-semibold">Aviso:</p>
            <p className="mt-1">{errorMsg}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div>
            {status !== 'completed' && (
              <button
                type="button"
                onClick={handleForceCheck}
                disabled={checkingNow}
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {checkingNow ? 'Detectando…' : '¿Ya iniciaste sesión? Detectar ahora'}
              </button>
            )}
          </div>

          <button
            onClick={handleCancel}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
          >
            {status === 'completed' ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  );
}
