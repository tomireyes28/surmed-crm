# Surmed — API NestJS

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

Ver [etapa 3](../docs/auditoria-2026-11-08/ETAPA-3-IMPLEMENTADA.md) para reproducción, resultados y despliegue. Supabase real, políticas remotas y restauración operativa se verifican en staging/piloto; los tests locales de archivos usan objetos simulados.
