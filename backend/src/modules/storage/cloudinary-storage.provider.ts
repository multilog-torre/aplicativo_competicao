import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { SaveFileParams, SaveFileResult, StorageProvider } from './storage.provider';

/**
 * Storage no Cloudinary — usado em hospedagens sem disco persistente (ex.:
 * Render free tier), onde o LocalStorageProvider perderia os arquivos a cada
 * reinicialização/deploy do serviço.
 *
 * Mantém o MESMO modelo de acesso do LocalStorageProvider: o backend nunca
 * expõe a URL do Cloudinary para o cliente — `read()` sempre baixa o arquivo
 * de volta e o controller o serve como um download autorizado (mesmo
 * contrato de `evidence.controller.ts`/`profile.controller.ts`/etc.).
 *
 * Ressalva de segurança: diferente do storage local (inacessível fora do
 * processo do backend), os arquivos ficam em `type: upload` do Cloudinary —
 * tecnicamente alcançáveis por quem descobrir a URL exata (public_id é um
 * UUID, não é listável nem previsível). Aceitável para o ambiente de
 * demonstração/teste atual; para produção definitiva, considerar
 * `type: authenticated` com URLs assinadas.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  public readonly providerName = 'cloudinary';

  constructor() {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new AppError(
        'STORAGE_PROVIDER=cloudinary requer CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET configurados.',
        500,
        'CLOUDINARY_NOT_CONFIGURED',
      );
    }

    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  /** PDFs/TXT viajam como 'raw'; imagens como 'image' — Cloudinary exige o tipo certo para buscar/apagar depois. */
  private resourceTypeFor(mimeType: string): 'image' | 'raw' {
    return mimeType.startsWith('image/') ? 'image' : 'raw';
  }

  public async save(params: SaveFileParams): Promise<SaveFileResult> {
    const resourceType = this.resourceTypeFor(params.mimeType);
    const publicId = `torre/${params.folder}/${uuidv4()}`;

    const uploadResult = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: resourceType, overwrite: false },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new AppError('Falha desconhecida ao enviar arquivo para o Cloudinary.', 502, 'CLOUDINARY_UPLOAD_FAILED'));
            return;
          }
          resolve(result);
        },
      );
      uploadStream.end(params.buffer);
    });

    // storagePath carrega o resource_type junto — necessário para buscar/apagar depois.
    return { storagePath: `${resourceType}/${uploadResult.public_id}`, storageUrl: uploadResult.secure_url };
  }

  public async read(storagePath: string): Promise<Buffer> {
    const { resourceType, publicId } = this.parsePath(storagePath);
    const url = cloudinary.url(publicId, { resource_type: resourceType, secure: true });

    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError('Arquivo não encontrado no armazenamento.', 404, 'FILE_NOT_FOUND');
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async delete(storagePath: string): Promise<void> {
    const { resourceType, publicId } = this.parsePath(storagePath);
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  private parsePath(storagePath: string): { resourceType: 'image' | 'raw'; publicId: string } {
    const [resourceType, ...rest] = storagePath.split('/');
    if ((resourceType !== 'image' && resourceType !== 'raw') || rest.length === 0) {
      throw new AppError('Caminho de armazenamento inválido.', 400, 'INVALID_STORAGE_PATH');
    }
    return { resourceType, publicId: rest.join('/') };
  }
}
