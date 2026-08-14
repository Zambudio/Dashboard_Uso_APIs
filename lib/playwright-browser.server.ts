import { chromium, Browser } from 'playwright';
import { spawnSync } from 'child_process';
import path from 'path';

type ChromiumLaunchOptions = NonNullable<Parameters<typeof chromium.launch>[0]>;

function isMissingBrowser(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Executable doesn't exist") || message.includes('Executable doesn');
}

function installDevelopmentChromium(): boolean {
  // Next transforma require.resolve('playwright'); la ruta se construye desde
  // el paquete completo que prepare-standalone copia junto al servidor.
  const cliPath = path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
    stdio: 'inherit',
    env: process.env,
  });
  return result.status === 0;
}

/**
 * Usa Chromium de Playwright cuando ya está instalado. En una instalación
 * Electron endurecida no se relanza el EXE como Node (runAsNode está
 * deshabilitado), por lo que se reutiliza Edge o Chrome del sistema.
 */
export async function launchAvailableChromium(options: ChromiumLaunchOptions): Promise<Browser> {
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!isMissingBrowser(error)) throw error;
  }

  if (!process.versions.electron && installDevelopmentChromium()) {
    return chromium.launch(options);
  }

  for (const channel of ['msedge', 'chrome'] as const) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch (error) {
      if (!isMissingBrowser(error)) throw error;
    }
  }

  throw new Error(
    'No se encontró un navegador compatible. Instala Microsoft Edge o Google Chrome; en desarrollo también puedes ejecutar "npx playwright install chromium".'
  );
}
