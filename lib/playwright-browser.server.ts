import { chromium, Browser, BrowserContext } from 'playwright';
import { spawnSync } from 'child_process';
import path from 'path';

type ChromiumLaunchOptions = NonNullable<Parameters<typeof chromium.launch>[0]>;
type ChromiumLaunchPersistentOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

function isMissingBrowser(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Executable doesn't exist") ||
    message.includes('Executable doesn') ||
    message.includes('Chromium distribution') ||
    message.includes('not found') ||
    message.includes('browserType.launch')
  );
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

export function getPersistentUserDataDir(): string {
  const baseDir =
    process.env.LOCALAPPDATA ||
    process.env.APPDATA ||
    path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
  return path.join(baseDir, 'Dashboard_Uso_APIs', 'browser-profile');
}

/**
 * Usa Chromium de Playwright cuando ya está instalado. En una instalación
 * Electron endurecida no se relanza el EXE como Node (runAsNode está
 * deshabilitado), por lo que se reutiliza Edge o Chrome del sistema.
 */
export async function launchAvailableChromium(options: ChromiumLaunchOptions): Promise<Browser> {
  for (const channel of ['msedge', 'chrome'] as const) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch (error) {
      if (!isMissingBrowser(error)) throw error;
    }
  }

  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!isMissingBrowser(error)) throw error;
  }

  if (!process.versions.electron && installDevelopmentChromium()) {
    return chromium.launch(options);
  }

  throw new Error(
    'No se encontró un navegador compatible. Instala Microsoft Edge o Google Chrome; en desarrollo también puedes ejecutar "npx playwright install chromium".'
  );
}

/**
 * Lanza un contexto de navegador PERSISTENTE SOLO para el login interactivo
 * (con un humano delante). Únicamente el usuario autentica; los fetchers de
 * uso automáticos usan `launchAvailableChromium` (efímero, sin perfil en disco).
 *
 * El perfil vive bajo %LOCALAPPDATA%\Dashboard_Uso_APIs\browser-profile, fuera
 * del directorio de la app empaquetada (no se distribuye) y la persistencia
 * sigue formatos cifrados por el propio Chromium/DPAPI en Windows. No se usan
 * flags que degraden la seguridad del navegador (sin `--no-sandbox` ni
 * desactivar `site-per-process`). Para borrar la sesión, elimina ese directorio.
 * Si el perfil primario estuviera bloqueado por otro proceso, se recurre a un
 * perfil aislado temporal.
 */
export async function launchInteractivePersistentContext(
  userDataDir: string = getPersistentUserDataDir(),
  options: ChromiumLaunchPersistentOptions = {}
): Promise<BrowserContext> {
  const defaultArgs = ['--disable-blink-features=AutomationControlled', '--start-maximized', '--disable-infobars'];

  const mergedOptions: ChromiumLaunchPersistentOptions = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [...defaultArgs, ...(options.args || [])],
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    ...options,
  };

  const dirsToTry = [userDataDir, path.join(path.dirname(userDataDir), `browser-profile-temp-${Date.now()}`)];

  for (const dir of dirsToTry) {
    for (const channel of ['msedge', 'chrome'] as const) {
      try {
        return await chromium.launchPersistentContext(dir, { ...mergedOptions, channel });
      } catch (error) {
        if (!isMissingBrowser(error)) {
          console.warn(
            `[playwright-browser] Aviso lanzando ${channel} en ${dir}:`,
            error instanceof Error ? error.message : String(error)
          );
          break;
        }
      }
    }

    try {
      return await chromium.launchPersistentContext(dir, mergedOptions);
    } catch (error) {
      if (!isMissingBrowser(error)) {
        console.warn(
          `[playwright-browser] Aviso lanzando chromium en ${dir}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  if (!process.versions.electron && installDevelopmentChromium()) {
    return chromium.launchPersistentContext(userDataDir, mergedOptions);
  }

  throw new Error(
    'No se encontró un navegador compatible o el perfil está bloqueado. Instala Microsoft Edge o Google Chrome; en desarrollo también puedes ejecutar "npx playwright install chromium".'
  );
}
