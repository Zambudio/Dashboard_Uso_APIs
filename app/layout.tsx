import './globals.css';
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Monitor de uso de APIs de IA',
  description: 'Monitoriza uso, saldo y límites de tus suscripciones y APIs de IA.',
  manifest: '/manifest.json',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
