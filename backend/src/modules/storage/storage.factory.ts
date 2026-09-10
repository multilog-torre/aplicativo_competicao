import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageProvider } from './storage.provider';

let instance: StorageProvider | null = null;

/**
 * Fábrica do provider de storage ativo, conforme STORAGE_PROVIDER (.env).
 * Azure Blob Storage e AWS S3 são suportados pela arquitetura (interface
 * StorageProvider), mas a implementação concreta fica reservada para quando
 * a fase de deploy em nuvem definitiva for aprovada. "cloudinary" foi
 * implementado como alternativa para hospedagens sem disco persistente
 * (ex.: Render free tier) — ver cloudinary-storage.provider.ts.
 */
export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  switch (env.STORAGE_PROVIDER) {
    case 'local':
      instance = new LocalStorageProvider();
      return instance;
    case 'cloudinary':
      instance = new CloudinaryStorageProvider();
      return instance;
    case 'azure':
    case 's3':
      throw new AppError(
        `O provider de storage '${env.STORAGE_PROVIDER}' ainda não foi implementado nesta fase. Utilize STORAGE_PROVIDER=local ou cloudinary.`,
        500,
        'STORAGE_PROVIDER_NOT_IMPLEMENTED',
      );
    default:
      throw new AppError(`Provider de storage desconhecido: '${env.STORAGE_PROVIDER}'`, 500, 'UNKNOWN_STORAGE_PROVIDER');
  }
}
