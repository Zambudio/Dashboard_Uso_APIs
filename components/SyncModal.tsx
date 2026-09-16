'use client';

import { useState } from 'react';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshAll: () => Promise<void>;
}

export function SyncModal({ isOpen, onClose, onRefreshAll }: SyncModalProps) {
  const [activeTab, setActiveTab] = useState<'bookmarklet' | 'extension' | 'console'>('bookmarklet');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const bookmarkletCode = `javascript:(function(){const s=document.createElement('script');s.src='http://localhost:3000/bookmarklet.js?t='+Date.now();document.body.appendChild(s);})();`;
  const consoleCode = `fetch('http://localhost:3000/bookmarklet.js?t='+Date.now()).then(r=>r.text()).then(eval);`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/15 bg-[#12141c] p-6 shadow-2xl text-slate-200">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
                ⚡
              </span>
              Sincronizar Uso desde tu Navegador
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Conecta directamente con tus pestañas abiertas en Brave/Chrome sin introducir contraseñas ni bloqueos de login.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de métodos */}
        <div className="mt-5 flex gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab('bookmarklet')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'bookmarklet'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            📌 Marcador 1-Clic (Recomendado)
          </button>
          <button
            onClick={() => setActiveTab('extension')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'extension'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            🧩 Extensión Automática
          </button>
          <button
            onClick={() => setActiveTab('console')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'console'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            💻 Consola F12
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div className="mt-5 space-y-4">
          {activeTab === 'bookmarklet' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-cyan-950/30 border border-cyan-500/30 p-4">
                <p className="text-sm font-semibold text-cyan-300">
                  Paso 1: Arrastra este botón a tu barra de marcadores de Brave o Chrome
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <a
                    href={bookmarkletCode}
                    onClick={(e) => e.preventDefault()}
                    className="cursor-grab select-none rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110 active:cursor-grabbing inline-flex items-center gap-2"
                  >
                    <span>📊</span>
                    <span>Sincronizar IAs</span>
                  </a>
                  <span className="text-xs text-slate-400">
                    ← (Arrastra este botón a tu barra de marcadores)
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/60 border border-white/10 p-4 text-sm space-y-2">
                <p className="font-semibold text-white">Paso 2: Ve a la pestaña de tu IA y pulsa el marcador</p>
                <ul className="space-y-1.5 text-slate-300 text-xs list-disc list-inside">
                  <li>
                    En <span className="text-cyan-300 font-medium">Claude</span> (en cualquier pantalla o en Ajustes).
                  </li>
                  <li>
                    En <span className="text-emerald-300 font-medium">ChatGPT</span> (en{' '}
                    <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" className="underline text-blue-400">
                      chatgpt.com/settings/usage
                    </a>
                    ).
                  </li>
                  <li>
                    En <span className="text-purple-300 font-medium">Gemini</span> (en{' '}
                    <a href="https://gemini.google.com/usage" target="_blank" rel="noreferrer" className="underline text-blue-400">
                      gemini.google.com/usage
                    </a>
                    ).
                  </li>
                </ul>
                <p className="text-xs text-emerald-400 pt-1">
                  ✓ Verás aparecer una notificación verde en la pestaña confirmando la sincronización.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'extension' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-900/60 border border-white/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-white">Instalación en 1 minuto en Brave o Chrome:</p>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300">
                  <li>
                    Abre en una nueva pestaña:{' '}
                    <code className="rounded bg-black/40 px-2 py-0.5 text-cyan-300">brave://extensions</code> o{' '}
                    <code className="rounded bg-black/40 px-2 py-0.5 text-cyan-300">chrome://extensions</code>
                  </li>
                  <li>
                    Activa el interruptor <span className="text-white font-semibold">&quot;Modo de desarrollador&quot;</span> arriba a la derecha.
                  </li>
                  <li>
                    Haz clic en <span className="text-white font-semibold">&quot;Cargar descomprimida&quot;</span> y selecciona la carpeta del proyecto:
                    <div className="mt-1 font-mono text-[11px] bg-black/50 p-2 rounded border border-white/10 text-cyan-400 select-all">
                      z:\IA\02_Proyectos\Dashboard_Uso_APIs\extension
                    </div>
                  </li>
                </ol>
                <p className="text-xs text-emerald-400 pt-1">
                  ✓ La extensión sincronizará automáticamente el uso en segundo plano cada vez que tengas abiertas las webs de las IAs.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-900/60 border border-white/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-white">
                  Ejecutar directamente desde la Consola (F12) de la pestaña de la IA:
                </p>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-xs text-cyan-300 border border-white/10">
                    {consoleCode}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(consoleCode)}
                    className="absolute right-2 top-2 rounded-md bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20 transition"
                  >
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Abre la pestaña de Claude, ChatGPT o Gemini, pulsa <kbd className="px-1.5 py-0.5 bg-white/10 rounded">F12</kbd>, selecciona la pestaña <b>Consola</b>, pega el código anterior y pulsa Enter.
                </p>
              </div>
            </div>
          )}

          {/* Enlaces directos a las IAs */}
          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">Abrir páginas de uso:</span>
            <div className="flex gap-2">
              <a
                href="https://claude.ai/settings/usage"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                Claude ↗
              </a>
              <a
                href="https://chatgpt.com/settings/usage"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                ChatGPT ↗
              </a>
              <a
                href="https://gemini.google.com/usage"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                Gemini ↗
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              void onRefreshAll();
              onClose();
            }}
            className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition"
          >
            Actualizar Dashboard y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
