import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { SaveFileParams, SaveFileResult, StorageProvider } from './storage.provider';

/**
 * Storage local em disco — usado em desenvolvimento e como fallback.
 * Os arquivos ficam FORA de qualquer pasta servida estaticamente pelo Express:
 * o acesso só é possível através do endpoint autorizado de download
 * (ver evidence.controller.ts), nunca por URL direta.
 */
export class LocalStorageProvider implements StorageProvider {
  public readonly providerName = 'local';

  private get baseDir(): string {
    return path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH);
  }

  private resolveSafePath(storagePath: string): string {
    const resolved = path.resolve(this.baseDir, storagePath);
    // Proteção contra path traversal (ex.: storagePath = "../../etc/passwd")
    if (!resolved.startsWith(this.baseDir)) {
      throw new AppError('Caminho de armazenamento inválido.', 400, 'INVALID_STORAGE_PATH');
    }
    return resolved;
  }

  public async save(params: SaveFileParams): Promise<SaveFileResult> {
    const extension = path.extname(params.originalName).toLowerCase();
    const safeFileName = `${uuidv4()}${extension}`;
    const relativePath = path.posix.join(params.folder, safeFileName);
    const absolutePath = this.resolveSafePath(relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, params.buffer);

    return { storagePath: relativePath, storageUrl: null };
  }

  public async read(storagePath: string): Promise<Buffer> {
    const absolutePath = this.resolveSafePath(storagePath);
    try {
      return await fs.readFile(absolutePath);
    } catch {
      throw new AppError('Arquivo não encontrado no armazenamento.', 404, 'FILE_NOT_FOUND');
    }
  }

  public async delete(storagePath: string): Promise<void> {
    const absolutePath = this.resolveSafePath(storagePath);
    await fs.rm(absolutePath, { force: true });
  }
}
