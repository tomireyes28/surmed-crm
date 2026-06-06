import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global() // Lo hacemos global para usarlo en el módulo de historias clínicas sin importarlo a cada rato
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}