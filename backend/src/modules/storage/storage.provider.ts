/**
 * Contrato de armazenamento de arquivos (evidências, avatares, mural, etc.).
 *
 * A arquitetura (planejamento.md §4/§17) exige que o storage seja plugável —
 * hoje "local" (disco do servidor), no futuro Azure Blob Storage ou AWS S3 sem
 * que nenhuma regra de negócio precise mudar. Todo módulo de domínio depende
 * apenas desta interface, nunca de um provider concreto.
 */
export interface SaveFileParams {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  /** Prefixo lógico para organizar os arquivos (ex.: "evidence/<activityId>") */
  folder: string;
}

export interface SaveFileResult {
  /** Caminho interno usado para localizar/recuperar o arquivo futuramente */
  storagePath: string;
  /** URL pública, quando o provider expõe uma diretamente (ex.: CDN). Nulo quando o acesso é sempre mediado pelo backend. */
  storageUrl: string | null;
}

/** Redimensionamento opcional ao ler uma imagem — pedido pelo chamador quando só precisa
 * de uma versão pequena (thumbnail de lista, avatar, ícone), pra economizar o tráfego que
 * seria gasto reenviando o arquivo em tamanho original à toa (ver docs/sistema/mural.md). */
export interface ReadImageTransform {
  width: number;
  height?: number;
  /** 'fill' corta pra um quadrado exato (avatar/ícone); 'limit' só reduz, mantendo a proporção (foto). */
  crop: 'fill' | 'limit';
  /** Quando o arquivo original é um PDF, pede a 1ª página já rasterizada como JPG em vez
   * do PDF cru — é assim que o Mural mostra uma "prévia de imagem" de um PDF anexado.
   * Só tem efeito no CloudinaryStorageProvider (local nunca rasteriza PDF). */
  pdfFirstPageAsImage?: boolean;
}

export interface StorageProvider {
  readonly providerName: string;
  save(params: SaveFileParams): Promise<SaveFileResult>;
  /** Retorna o Buffer do arquivo para ser servido pelo backend (acesso privado/controlado).
   * `transform`, quando suportado pelo provider, pede uma versão redimensionada em vez do
   * arquivo original — providers que não sabem redimensionar (ex.: local) o ignoram. */
  read(storagePath: string, transform?: ReadImageTransform): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}
