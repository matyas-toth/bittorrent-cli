import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { UserError, errorMessage } from '../shared/errors.js';

export async function ensureDownloadDirectory(directory: string): Promise<string> {
  const resolved = path.resolve(directory);
  try {
    await mkdir(resolved, { recursive: true });
    const details = await stat(resolved);
    if (!details.isDirectory()) {
      throw new UserError(`Download destination is not a directory: ${resolved}`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(`Cannot use download destination "${resolved}": ${errorMessage(error)}`);
  }
}
