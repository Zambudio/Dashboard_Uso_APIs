import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI API Usage Dashboard',
  description: 'Monitoriza uso, saldo y límites de tus APIs de IA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
