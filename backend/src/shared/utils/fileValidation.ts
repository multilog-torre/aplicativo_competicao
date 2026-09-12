import { AppError } from '../errors/AppError';
import { UploadedFile } from '../types/upload';

/** Mapeamento de extensão -> MIME types aceitos, para validar que o arquivo enviado
 * realmente corresponde ao tipo declarado (defesa básica contra arquivos disfarçados). */
export const EXTENSION_MIME_MAP: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  svg: ['image/svg+xml'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
};

export function getFileExtension(fileName: string): string {
  return (fileName.split('.').pop() ?? '').toLowerCase();
}

/**
 * Valida extensão + correspondência de MIME type de um upload contra uma lista
 * de extensões permitidas. Lança AppError (422) em caso de violação.
 */
export function assertAllowedFile(file: UploadedFile, allowedExtensions: string[]): void {
  const extension = getFileExtension(file.originalname);

  if (!extension || !allowedExtensions.includes(extension)) {
    throw new AppError(
      `Tipo de arquivo não permitido. Extensões aceitas: ${allowedExtensions.join(', ')}.`,
      422,
      'INVALID_FILE_TYPE',
    );
  }

  const expectedMimeTypes = EXTENSION_MIME_MAP[extension];
  if (expectedMimeTypes && !expectedMimeTypes.includes(file.mimetype)) {
    throw new AppError('O conteúdo do arquivo não corresponde à extensão informada.', 422, 'FILE_MIME_MISMATCH');
  }
}
