import fs from 'fs';
import path from 'path';

const KEYS_VAR = 'DASHBOARD_PROVIDER_KEYS';

function resolveEnvFile(): string {
  return process.env.DASHBOARD_ENV_FILE || path.resolve(process.cwd(), '.env');
}

export function readEnvKeys(): Record<string, string> {
  const envFile = resolveEnvFile();
  if (!fs.existsSync(envFile)) return {};

  const raw = fs.readFileSync(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*DASHBOARD_PROVIDER_KEYS\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (!match || !match[1]) continue;
    try {
      return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

export function writeEnvKeys(keys: Record<string, string>): void {
  const envFile = resolveEnvFile();
  const encoded = Buffer.from(JSON.stringify(keys)).toString('base64');
  const newLine = `${KEYS_VAR}=${encoded}`;

  if (!fs.existsSync(envFile)) {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, `${newLine}\n`, 'utf8');
    return;
  }

  const raw = fs.readFileSync(envFile, 'utf8');
  const lines = raw.split(/\r?\n/);
  let replaced = false;

  const nextLines = lines.map((line) => {
    if (/^\s*DASHBOARD_PROVIDER_KEYS\s*=/.test(line)) {
      replaced = true;
      return newLine;
    }
    return line;
  });

  if (!replaced) {
    nextLines.push(newLine);
  }

  fs.writeFileSync(envFile, nextLines.join('\n'), 'utf8');
}
