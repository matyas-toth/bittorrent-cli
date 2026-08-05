import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ZodType } from 'zod';

export async function readValidatedJson<T>(
  filePath: string,
  schema: ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    const contents = await readFile(filePath, 'utf8');
    const parsed = schema.safeParse(JSON.parse(contents));
    return parsed.success ? parsed.data : fallback;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}
