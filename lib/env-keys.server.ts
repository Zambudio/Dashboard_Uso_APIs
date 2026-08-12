import fs from 'fs';
import path from 'path';
import { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker } from './cred-broker-client';

const KEYS_VAR = 'DASHBOARD_PROVIDER_KEYS';

function resolveEnvFile(): string {
  return process.env.DASHBOARD_ENV_FILE || path.resolve(process.cwd(), '.env');
}

export function readEnvVar<T>(varName: string, defaultValue: T): T {
  const envFile = resolveEnvFile();
  if (!fs.existsSync(envFile)) return defaultValue;

  const raw = fs.readFileSync(envFile, 'utf8');
  const regex = new RegExp(`^\\s*${varName}\\s*=\\s*"?([^"\\r\\n]*)"?\\s*$`);
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(regex);
    if (!match || !match[1]) continue;
    try {
      return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as T;
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

export function writeEnvVar<T>(varName: string, value: T): void {
  const envFile = resolveEnvFile();
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64');
  const newLine = `${varName}=${encoded}`;

  if (!fs.existsSync(envFile)) {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, `${newLine}\n`, 'utf8');
    return;
  }

  const raw = fs.readFileSync(envFile, 'utf8');
  const lines = raw.split(/\r?\n/);
  let replaced = false;

  const regex = new RegExp(`^\\s*${varName}\\s*=`);
  const nextLines = lines.map((line) => {
    if (regex.test(line)) {
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

export async function readEnvKeys(): Promise<Record<string, string>> {
  const broker = resolveBrokerConfig(process.env);
  if (broker) return readKeysFromBroker(broker);
  return readEnvVar<Record<string, string>>(KEYS_VAR, {});
}

export async function writeEnvKeys(keys: Record<string, string>): Promise<void> {
  const broker = resolveBrokerConfig(process.env);
  if (broker) return writeKeysToBroker(broker, keys);
  writeEnvVar(KEYS_VAR, keys);
}

export async function deleteEnvKeys(ids: string[]): Promise<void> {
  const existing = await readEnvKeys();
  for (const id of ids) delete existing[id];
  await writeEnvKeys(existing);
}
