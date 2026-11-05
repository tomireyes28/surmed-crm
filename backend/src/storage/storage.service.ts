import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import 'multer';

export const MAX_CLINICAL_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900; // 15 minutos

export interface ValidatedClinicalFileMetadata {
  originalName: string;
  mimeType: string;
  canonicalExt: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: 'CLEAN_MAGIC_VERIFIED';
}

export interface UploadedClinicalFileResult extends ValidatedClinicalFileMetadata {
  storagePath: string;
}

interface AllowedMimeSignature {
  mimeType: string;
  canonicalExt: string;
  extensions: readonly string[];
  matchesMagic: (buffer: Buffer) => boolean;
}

const ALLOWED_SIGNATURES: readonly AllowedMimeSignature[] = [
  {
    mimeType: 'application/pdf',
    canonicalExt: 'pdf',
    extensions: ['pdf'],
    // %PDF- (0x25 0x50 0x44 0x46 0x2D)
    matchesMagic: (buf) =>
      buf.length >= 5 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46 &&
      buf[4] === 0x2d,
  },
  {
    mimeType: 'image/jpeg',
    canonicalExt: 'jpg',
    extensions: ['jpg', 'jpeg'],
    // JPEG SOI + marker (0xFF 0xD8 0xFF)
    matchesMagic: (buf) =>
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    canonicalExt: 'png',
    extensions: ['png'],
    // PNG signature (89 50 4E 47 0D 0A 1A 0A)
    matchesMagic: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    mimeType: 'image/webp',
    canonicalExt: 'webp',
    extensions: ['webp'],
    // RIFF....WEBP
    matchesMagic: (buf) =>
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

@Injectable()
export class StorageService {
  private supabaseClient: SupabaseClient | null = null;

  constructor(@Optional() private configService?: ConfigService) {}

  private getClient(): SupabaseClient {
    if (this.supabaseClient) {
      return this.supabaseClient;
    }

    const url =
      this.configService?.get<string>('SUPABASE_URL') ??
      process.env.SUPABASE_URL;
    const key =
      this.configService?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new InternalServerErrorException(
        'Almacenamiento de archivos no configurado en el servidor.',
      );
    }

    this.supabaseClient = createClient(url, key);
    return this.supabaseClient;
  }

  /**
   * Valida tamaño, extensión, MIME y firma real de bytes (magic bytes) del archivo clínico,
   * y calcula su hash criptográfico SHA-256 (T11 / S07).
   */
  validateClinicalFile(file: Express.Multer.File): ValidatedClinicalFileMetadata {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('El archivo adjunto es inválido o está vacío.');
    }

    const sizeBytes = file.size ?? file.buffer.length;
    if (sizeBytes <= 0) {
      throw new BadRequestException('El archivo adjunto está vacío.');
    }

    if (sizeBytes > MAX_CLINICAL_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        'El archivo excede el tamaño máximo permitido de 10 MB.',
      );
    }

    const sanitizedOriginalName = (file.originalname || 'adjunto')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const ext = sanitizedOriginalName.split('.').pop()?.toLowerCase() ?? '';
    const declaredMime = (file.mimetype || '').toLowerCase();

    const spec = ALLOWED_SIGNATURES.find(
      (item) =>
        item.mimeType === declaredMime && item.extensions.includes(ext),
    );

    if (!spec) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se admiten documentos PDF e imágenes JPG, PNG o WEBP.',
      );
    }

    if (!spec.matchesMagic(file.buffer)) {
      throw new BadRequestException(
        'El contenido real del archivo no coincide con el formato declarado (firma binaria inválida).',
      );
    }

    const sha256 = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    return {
      originalName: sanitizedOriginalName,
      mimeType: spec.mimeType,
      canonicalExt: spec.canonicalExt,
      sizeBytes,
      sha256,
      scanStatus: 'CLEAN_MAGIC_VERIFIED',
    };
  }

  async uploadValidatedFile(
    file: Express.Multer.File,
    patientId: string,
  ): Promise<UploadedClinicalFileResult> {
    const metadata = this.validateClinicalFile(file);
    const objectKey = `${patientId}/${crypto.randomUUID()}.${metadata.canonicalExt}`;

    const { data, error } = await this.getClient()
      .storage.from('medical-records')
      .upload(objectKey, file.buffer, {
        contentType: metadata.mimeType,
        upsert: false,
      });

    if (error || !data?.path) {
      throw new InternalServerErrorException(
        'Error al subir el archivo al almacenamiento seguro.',
      );
    }

    return {
      ...metadata,
      storagePath: data.path,
    };
  }

  async uploadFile(
    file: Express.Multer.File,
    patientId: string,
  ): Promise<string> {
    const uploaded = await this.uploadValidatedFile(file, patientId);
    return uploaded.storagePath;
  }

  /**
   * Elimina un objeto del bucket privado (usado para compensación/rollback si falla la base de datos).
   */
  async removeFile(path: string): Promise<void> {
    if (!path) return;
    try {
      await this.getClient().storage.from('medical-records').remove([path]);
    } catch {
      // No propagar excepción secundaria durante compensación
    }
  }

  async getSignedUrl(
    path: string,
    expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string> {
    const { data, error } = await this.getClient()
      .storage.from('medical-records')
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        'Error al generar el enlace temporal del archivo clínico.',
      );
    }

    return data.signedUrl;
  }

  /**
   * Genera URL firmada de forma tolerante a fallos: si un adjunto falta en el bucket
   * o falló la firma, devuelve `null` en lugar de bloquear toda la lectura de la historia clínica (T11).
   */
  async getSignedUrlSafe(
    path: string,
    expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    try {
      return await this.getSignedUrl(path, expiresInSeconds);
    } catch {
      return null;
    }
  }
}
