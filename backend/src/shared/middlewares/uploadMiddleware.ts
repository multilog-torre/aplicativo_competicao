import multer from 'multer';
import { env } from '../../config/env';

/**
 * Recebe o arquivo em memória (não grava em disco diretamente) para que a
 * gravação final seja sempre feita pelo StorageProvider ativo — mantendo a
 * lógica de negócio agnóstica de onde o arquivo efetivamente é persistido
 * (local hoje; Azure Blob/S3 no futuro).
 */
export const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
}).single('file');
