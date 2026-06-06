import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import 'multer';

@Injectable()
export class StorageService {
  // Al inicializarlo directamente acá, TypeScript infiere el tipo exacto y ESLint se calma
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async uploadFile(file: Express.Multer.File, patientId: string): Promise<string> {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${patientId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await this.supabase.storage
      .from('medical-records')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      console.error(error);
      throw new InternalServerErrorException('Error al subir el archivo a Supabase');
    }

    return data.path; 
  }

  async getSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from('medical-records')
      .createSignedUrl(path, 3600); 

    if (error) {
      throw new InternalServerErrorException('Error al generar el link del archivo');
    }

    return data.signedUrl;
  }
}