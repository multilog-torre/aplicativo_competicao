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

export interface StorageProvider {
  readonly providerName: string;
  save(params: SaveFileParams): Promise<SaveFileResult>;
  /** Retorna o Buffer do arquivo para ser servido pelo backend (acesso privado/controlado). */
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}
