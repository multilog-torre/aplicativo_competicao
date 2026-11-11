import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { ReadImageTransform, SaveFileParams, SaveFileResult, StorageProvider } from './storage.provider';

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

  /** TXT viaja como 'raw'; imagens E PDF como 'image' — PDF precisa desse tipo no Cloudinary
   * pra poder ser rasterizado página-a-página sob demanda (ver `read()` com
   * `pdfFirstPageAsImage`), senão o arquivo só poderia ser baixado inteiro. */
  private resourceTypeFor(mimeType: string): 'image' | 'raw' {
    return mimeType.startsWith('image/') || mimeType === 'application/pdf' ? 'image' : 'raw';
  }

  public async save(params: SaveFileParams): Promise<SaveFileResult> {
    const resourceType = this.resourceTypeFor(params.mimeType);
    const publicId = `torre/${params.folder}/${uuidv4()}`;

    const uploadResult = await new Promise<{ public_id: string; secure_url: string; format: string }>((resolve, reject) => {
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

    // storagePath carrega o resource_type E o formato real (ex.: 'pdf', 'jpg') — o formato
    // é necessário pra resolver a URL de busca de um recurso 'image' sem ambiguidade (ver
    // read(): sem ele, pedir de volta o arquivo ORIGINAL de um PDF, que agora sobe como
    // 'image' pra poder ser rasterizado, dava 404 — bug real em produção, corrigido aqui).
    return {
      storagePath: `${resourceType}/${uploadResult.format}/${uploadResult.public_id}`,
      storageUrl: uploadResult.secure_url,
    };
  }

  public async read(storagePath: string, transform?: ReadImageTransform): Promise<Buffer> {
    const { resourceType, format, publicId } = this.parsePath(storagePath);
    // Transformação só faz sentido pra imagem — pedir isso num PDF/raw o Cloudinary rejeitaria.
    const applyTransform = transform && resourceType === 'image';
    const url = cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      // Formato explícito do arquivo original (quando conhecido) — evita ambiguidade/404
      // ao buscar um recurso 'image' sem transformação (ver nota em save()). Quando uma
      // transformação rasteriza o PDF como JPG, o format abaixo já sobrescreve este.
      ...(format && { format }),
      ...(applyTransform && {
        width: transform.width,
        height: transform.height,
        crop: transform.crop,
        quality: 'auto',
        // Rasteriza a 1ª página do PDF como JPG em vez de devolver o PDF cru.
        ...(transform.pdfFirstPageAsImage && { format: 'jpg', page: 1 }),
      }),
    });

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

  /** storagePath tem 2 formatos possíveis: antigo (`resourceType/publicId`, sem formato —
   * arquivos salvos antes desta correção) e novo (`resourceType/format/publicId`). Como
   * todo publicId começa com o literal "torre/" (ver save()), dá pra diferenciar os dois
   * sem precisar de uma migração: se o 2º segmento for "torre", é o formato antigo. */
  private parsePath(storagePath: string): { resourceType: 'image' | 'raw'; format: string | null; publicId: string } {
    const segments = storagePath.split('/');
    const [resourceType] = segments;
    if ((resourceType !== 'image' && resourceType !== 'raw') || segments.length < 2) {
      throw new AppError('Caminho de armazenamento inválido.', 400, 'INVALID_STORAGE_PATH');
    }
    if (segments[1] === 'torre') {
      return { resourceType, format: null, publicId: segments.slice(1).join('/') };
    }
    return { resourceType, format: segments[1], publicId: segments.slice(2).join('/') };
  }
}
