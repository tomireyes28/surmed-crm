# Surmed — API NestJS

Preparación de producción y recuperación: [receta](../deploy/README.md), [evidencia etapa 4](../docs/auditoria-2026-11-09/ETAPA-4-PREPARACION.md). Comandos `backup:create`, `backup:restore-test`, `test:backup-drill`, `production:check` y `test:operations`; requieren las variables explícitas documentadas. Las copias/claves permanecen fuera de Git. El piloto se difiere hasta disponibilidad del centro.

Backend privado con Prisma/PostgreSQL, sesiones persistentes y adjuntos en Supabase Storage privado. Requiere Node.js >=22. Configuración e instalación completa en [README raíz](../README.md); variables en [.env.example](.env.example).

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

Para desarrollo: `npm run start:dev` (puerto 3000). El primer administrador se crea con `npm run provision:admin` y variables de CLI; no hay endpoint público de provisión. No cargar el seed de demo en el entorno del cliente.

```powershell
npm run lint:check
npm run typecheck
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

La suite HTTP anterior usa dobles de Prisma/Storage y arranca Nest con la configuración real. Las suites `test:postgres`, `test:security` y `test:delivery` usan bases PostgreSQL descartables separadas. Requieren URLs explícitas y nombres/hosts guardados; eliminan datos de prueba. `test:delivery` reconstruye el esquema descartable, aplica las migraciones previas, guarda datos y verifica la actualización actual. Nunca apuntarlas a datos útiles.

Ver [etapa 3](../docs/auditoria-2026-11-08/ETAPA-3-IMPLEMENTADA.md) y [Supabase real verificado](../docs/auditoria-2026-11-09/SUPABASE-STAGING.md). Los tests locales de archivos usan dobles; `staging:verify` usa PostgreSQL y Storage remotos sin sustitución.

En el staging configurado, Nest usa `DATABASE_URL` con el rol limitado `surmed_app`. Las migraciones usan otra conexión, `MIGRATION_DATABASE_URL`, mediante **`npx prisma migrate deploy --config prisma.migrate.config.ts`**. La configuración Prisma predeterminada sigue usando únicamente DATABASE_URL para que las pruebas locales no seleccionen accidentalmente el migrador remoto del archivo .env.

`npm run staging:reset` es destructivo y solo admite el proyecto de pruebas explícito y la confirmación por variable documentada. No usarlo para producción. `npm run staging:verify` agrega datos sintéticos; no limpia datos previos. Los usuarios y contraseñas aleatorias de la última ejecución se guardan en `.tmp/staging-access.json`, excluido de Git. `npm run test:permissions` comprueba RLS, permisos de plataforma y restricciones del rol de ejecución sobre PostgreSQL local descartable.
