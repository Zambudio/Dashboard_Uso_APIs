'use client';

import { useState } from 'react';
import { ProviderKey } from '@/types/api';

interface ProviderLogoProps {
  provider: ProviderKey;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<ProviderLogoProps['size']>, { badge: string; icon: string }> = {
  sm: { badge: 'h-7 w-7 rounded-lg', icon: 'h-4 w-4' },
  md: { badge: 'h-9 w-9 rounded-xl', icon: 'h-5 w-5' },
  lg: { badge: 'h-12 w-12 rounded-2xl', icon: 'h-7 w-7' },
};

const SIX_ANGLES = [0, 60, 120, 180, 240, 300];
const THREE_ANGLES = [0, 60, 120];

/** Logos de marca reales; si el archivo no está en public/logos todavía, se usa el SVG dibujado a mano como respaldo. */
const IMAGE_SRC: Partial<Record<ProviderKey, string>> = {
  openai: '/logos/openai.png',
  anthropic: '/logos/claude.png',
  'claude-pro': '/logos/claude.png',
  gemini: '/logos/gemini.png',
  deepseek: '/logos/deepseek.png',
};

function DrawnMark({ provider, icon }: { provider: ProviderKey; icon: string }) {
  switch (provider) {
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" className={icon} fill="none">
          {SIX_ANGLES.map((deg) => (
            <rect key={deg} x="10.4" y="2.6" width="3.2" height="7.4" rx="1.6" fill="#ffffff" transform={`rotate(${deg} 12 12)`} />
          ))}
          <circle cx="12" cy="12" r="2.9" fill="#10a37f" stroke="#ffffff" strokeWidth="1.1" />
        </svg>
      );
    case 'anthropic':
    case 'claude-pro':
      return (
        <svg viewBox="0 0 24 24" className={icon} fill="none">
          {THREE_ANGLES.map((deg) => (
            <rect key={deg} x="11" y="3" width="2" height="18" rx="1" fill="#F6ECE4" transform={`rotate(${deg} 12 12)`} />
          ))}
        </svg>
      );
    case 'gemini':
      return (
        <svg viewBox="0 0 24 24" className={icon} fill="#ffffff">
          <path d="M12 2c0.7 5.6 4.6 9.4 10 10 -5.4 0.6 -9.3 4.4 -10 10 -0.7 -5.6 -4.6 -9.4 -10 -10 5.4 -0.6 9.3 -4.4 10 -10z" />
        </svg>
      );
    case 'deepseek':
      return (
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3.2 9.3c1.4-1.6 2.9-1.6 4.3 0s2.9 1.6 4.3 0 2.9-1.6 4.3 0 2.9 1.6 4.4 0" />
          <path d="M3.2 15.1c1.4-1.6 2.9-1.6 4.3 0s2.9 1.6 4.3 0 2.9-1.6 4.3 0 2.9 1.6 4.4 0" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.5" cy="15.5" r="3.2" />
          <path d="M10.7 13.3 18.5 5.5m0 0 2 2m-2-2v2h2" />
        </svg>
      );
  }
}

const FALLBACK_BG: Partial<Record<ProviderKey, string>> = {
  openai: 'bg-[#10a37f]',
  anthropic: 'bg-[#CC7A5C]',
  'claude-pro': 'bg-[#CC7A5C]',
  deepseek: 'bg-[#4D6BFE]',
};

export function ProviderLogo({ provider, size = 'md' }: ProviderLogoProps) {
  const { badge, icon } = SIZE_CLASSES[size];
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = IMAGE_SRC[provider];

  if (imageSrc && !imageFailed) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden ${badge} bg-black/30 shadow-inner shadow-black/20`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      </span>
    );
  }

  const bg = FALLBACK_BG[provider] ?? 'bg-slate-600';
  const gradient = provider === 'gemini' ? { background: 'linear-gradient(135deg, #4285F4 0%, #9B72CB 55%, #D96570 100%)' } : undefined;

  return (
    <span className={`flex shrink-0 items-center justify-center ${badge} ${gradient ? '' : bg} shadow-inner shadow-black/20`} style={gradient}>
      <DrawnMark provider={provider} icon={icon} />
    </span>
  );
}
