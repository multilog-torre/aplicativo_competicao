/** Formato normalizado de um arquivo recebido via multer (memoryStorage). */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
