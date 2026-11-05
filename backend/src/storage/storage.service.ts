import { Injectable, InternalServerErrorException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'multer';

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

  async uploadFile(file: Express.Multer.File, patientId: string): Promise<string> {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${patientId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await this.getClient()
      .storage.from('medical-records')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      throw new InternalServerErrorException('Error al subir el archivo a Supabase');
    }

    return data.path;
  }

  async getSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.getClient()
      .storage.from('medical-records')
      .createSignedUrl(path, 3600);

    if (error) {
      throw new InternalServerErrorException('Error al generar el link del archivo');
    }

    return data.signedUrl;
  }
}
