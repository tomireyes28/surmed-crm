# Preparación de producción

Receta para un servidor Linux con Docker Compose y proxy HTTPS en el host. No se contrató hosting, configuró DNS, publicó el sistema ni realizó un piloto. Reemplazar ejemplos y aprobar el entorno antes de ejecutarlos. Next requiere servidor SSR/BFF; no es una web estática.

## Entornos y secretos

Usar un proyecto PostgreSQL/Storage nuevo o transferido a Surmed, con propietario institucional, MFA del proveedor y accesos delegados. Conservar la demo para pruebas; no trasladar sus usuarios/pacientes a producción. PostgreSQL puede migrarse mediante exportación/restauración; Storage y sus políticas se trasladan por separado.

Copiar backend.env.example, frontend.env.example y operations.env.example a sus archivos .env privados, ignorados por Git. En Linux restringir permisos a 0600 y custodiar secretos institucionalmente. No compartir `docker compose config` ni inspecciones completas: revelan secretos; usar `config --quiet`.

| Proceso | Credenciales |
| --- | --- |
| backend.env | SQL surmed_app, JWT aleatorio, clave privada Storage |
| frontend.env | Solo NODE_ENV, API_URL privada, APP_ORIGIN HTTPS |
| operations.env, sesión separada | Migrador, bootstrap y clave de cifrado de backups |

No inyectar operaciones en servicios web ni secretos como build args. Dockerfiles excluyen .env; backend final contiene dist y dependencias productivas. El stage operations conserva herramientas privilegiadas para credenciales temporales.

## Primera instalación, cuando exista el entorno

1. Acordar proveedor, región, costos, dominio, responsables y soporte. Revisar tratamiento de datos con el centro. No hay integración de facturación fiscal ni firma digital clínica.
2. Crear PostgreSQL y el bucket privado medical-records desde Supabase Dashboard/API. Comprobar TLS con certificados válidos desde el host; no desactivar su verificación. Usar conexión directa/session pooler para migraciones y dimensionar el pool runtime según el plan.
3. En sesión operativa con MIGRATION_DATABASE_URL temporal, desde backend ejecutar `npm ci` y `npx prisma migrate deploy --config prisma.migrate.config.ts`. Alternativa Docker desde la raíz:

   ```bash
   docker build --target operations -t surmed-operations:$RELEASE_TAG backend
   docker run --rm --env-file deploy/operations.env --entrypoint npx surmed-operations:$RELEASE_TAG prisma migrate deploy --config prisma.migrate.config.ts
   ```

4. El rol surmed_app se crea sin LOGIN. Desde psql con migrador: `ALTER ROLE surmed_app LOGIN;` y contraseña aleatoria mediante `\password surmed_app`, sin escribir el secreto en SQL/historial. Formar DATABASE_URL con rol limitado, contraseña codificada para URL y TLS. No conceder membresías administrativas. Confirmar current_user, atributos, RLS en 17 tablas y ausencia de grants anon/authenticated/service_role sobre tablas de aplicación.
5. Ejecutar [supabase-storage-hardening.sql](../backend/ops/supabase-storage-hardening.sql) con migrador en ese proyecto nuevo. Verificar bucket privado, límite 10 MiB, PDF/JPEG/PNG/WebP y políticas restrictivas. Probar denegación por Data API, URL pública y roles cliente. Prisma no crea esquemas gestionados Supabase.
6. En sesión temporal con DATABASE_URL limitado y ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME, ejecutar `npm run provision:admin`. Su upsert cambia la contraseña si el usuario existe: herramienta inicial, no tarea rutinaria sobre cuentas activas. Para recuperación usar el flujo de un uso de la app. Retirar secretos de bootstrap; crear ADMIN de respaldo individual, médicos/recepción con identidad y asignaciones verificadas. No reutilizar cuentas de demo.
7. Desde backend con dependencias instaladas:

   ```bash
   BACKEND_PRODUCTION_ENV=../deploy/backend.env FRONTEND_PRODUCTION_ENV=../deploy/frontend.env npm run production:check
   ```

   Preflight estático: rechaza ejemplos, SQL administrador/sin TLS, JWT débil, orígenes incorrectos, Swagger y secretos operativos en runtime/frontend. No autentica credenciales ni certifica infraestructura. Verificar conexiones/grants/Storage desde hosting real.
8. Desde la raíz, construir y arrancar usando el commit revisado:

   ```bash
   export RELEASE_TAG=<commit-revisado>
   docker compose -f deploy/compose.yml config --quiet
   docker compose -f deploy/compose.yml build
   docker compose -f deploy/compose.yml up -d --no-build --wait --wait-timeout 120
   ```

   Web en 127.0.0.1:3001; backend sin puertos publicados. Ambos como node, filesystem read-only, sin capabilities, healthchecks y logs rotados. Conservar imágenes/digests anteriores para rollback. Publicar imágenes en registry requiere autorización. El build descarga dependencias y fuentes Google, incluidas luego en la imagen.
9. Instalar proxy HTTPS en el host (Caddyfile.example) o equivalente del hosting. Configurar DNS/certificados; cerrar 3000/3001 a Internet, publicar solo 80/443. Compose no termina TLS. Comprobar certificados, redirect HTTP→HTTPS, HSTS, cookies Secure/HttpOnly/SameSite, límites compatibles con adjuntos 10 MiB y rechazo de mutaciones ajenas. Si el proxy corre en contenedor, adaptar red/upstream: el ejemplo apunta al host.
10. Probar tres roles y subida/descarga/revocación desde HTTPS con datos sintéticos. Activar monitoreo/backup externo y recuperar en aislado antes de cargar datos reales. Capacitación, equipos y aceptación se coordinan cuando el centro esté disponible.

## Actualizaciones y rollback

Registrar commit, digests/imágenes, migraciones y operador. Conservar imágenes previas. Detener todas las instancias/imports/workers/ediciones administrativas y respaldar base+archivos fuera del host, con clave separada. Aplicar migraciones con migrador; nunca db push, migrate dev o reset en producción.

Si no cambió esquema, volver a imágenes previas y comprobar readiness/roles/adjuntos. Si cambió, no asumir compatibilidad ni borrar migraciones: mantener cerrado, aplicar arreglo revisado o recuperar en entorno nuevo y conmutar después de validar. Rotar JWT_SECRET y revocar sesiones históricas antes de reabrir la copia. Documentar pérdida según punto recuperado; no prometer RPO cero.

## Backup completo y recuperación

Los backups SQL de Supabase no incluyen bytes de Storage ([proveedor](https://supabase.com/docs/guides/platform/backups)). Aquí se respaldan public de Surmed y todo medical-records, no un clon íntegro de plataforma: no incluye auth, extensiones/configuración gestionada, otros buckets, claves, DNS, certificados ni código. Custodiarlos por separado.

Requiere Node 22, dependencias backend y pg_dump/pg_restore compatibles ([PostgreSQL](https://www.postgresql.org/docs/17/app-pgdump.html)); se probaron herramientas 17. Opcional PG_TOOLS_CONTAINER con PostgreSQL ya iniciado. No crea/elimina contenedores; al restaurar localhost mediante Docker, ese contenedor debe ser el PostgreSQL destino y se usa su 5432 interior. Con binarios nativos se respeta URL completa.

Detener todos los escritores, suministrar variables de operations.env.example desde gestor de secretos y ejecutar desde backend:

```bash
export BACKUP_MAINTENANCE_CONFIRMED=writes-stopped
npm run backup:create
```

No lee .env ni detiene servicios automáticamente. Exportar variables sin imprimirlas/registrarlas. La confirmación no demuestra ausencia de otros escritores: mantenerlos detenidos hasta completar. La API usa rutas inmutables, pero el proveedor permite cambios administrativos externos.

Dump custom y huellas de las 17 tablas comparten snapshot SQL. Descarga todas las páginas/carpetas, revocados y huérfanos; cada referencia debe existir y los archivos con metadatos coincidir en bytes/SHA-256. Conserva/reportan huérfanos para investigar, sin borrarlos. Límite soportado 10 MiB por objeto.

Cada entrada/manifiesto se cifra con AES-256-GCM, IV aleatorio y clave de 32 bytes. Manifiesto autenticado al final: sin él no hay copia completa. Proteger permisos/ACL y transferir el directorio cifrado fuera del host/proyecto, con retención institucional. **Custodiar la clave en otro sistema**: sin ella no hay recuperación. La clave de ensayo permanece en .tmp solo por ser datos sintéticos; no es política productiva.

Recuperación automatizada de prueba: definir RESTORE_BACKUP_DIRECTORY, RESTORE_TEST_DATABASE_URL (base vacía localhost surmed_restore_test), RESTORE_TEST_BUCKET (nuevo surmed-restore-test-<uuid>), clave y credenciales de Storage de pruebas; ejecutar `npm run backup:restore-test`. Autentica todo antes de modificar destino, compara todas las filas, repone grants y descarga archivos restaurados para comparar hashes. No admite reset/overwrite/destino remoto. El bucket queda para pruebas; retirarlo por su nombre registrado. Ante fallo conserva destino parcial para diagnóstico privado.

`npm run test:backup-drill` usa la demo explícita y sus accesos .tmp/staging-access.json, base vacía y bucket nuevo; comprueba roles/login/logout/adjuntos por Nest real y retira su bucket al pasar. Exige SURMED_STAGING_PROJECT_REF, RESTORE_TEST_DATABASE_URL y opcional PG_TOOLS_CONTAINER. Clave/copias fuera de Git.

Recuperar producción en nuevo proyecto/proveedor exige una operación revisada: recrear roles/extensiones/configuración, restaurar public sin dueños/ACL antiguos, reponer permisos, bucket privado y bytes por API (no INSERT en storage.objects), conciliar, actualizar conexiones, invalidar sesiones y validar HTTPS antes de conmutar. El modo automático rechaza destinos remotos deliberadamente; el ensayo local no certifica un proveedor nuevo.

No se configuraron cron, almacenamiento externo ni alertas reales. Antes de datos reales: acordar frecuencia/retención/responsable, programar backups, comprobar custodia y repetir recuperación periódica. RPO≤24 h y RTO≤2 h son objetivos propuestos, pendientes de aprobación/medición con volumen e infraestructura reales.

## Monitoreo y apertura futura

API /health comprueba proceso; /health/ready, PostgreSQL. Monitorear por red interna/túnel. Web / comprueba Next, no DB/Storage. Añadir monitoreo sintético con mínimo alcance y datos no clínicos, sin tokens/cookies en logs. Alertar caídas, errores de archivos, backup fallido/atrasado, faltantes/huérfanos, cuotas y certificados; definir receptor y probar entrega cuando exista hosting.

Antes de apertura: cuentas/MFA del proveedor, decisión sobre MFA de usuarios app (no implementado), datos/inventario conciliados, equipos/conectividad, contingencia, capacitación y aceptación del dueño/responsable clínico. Ver [continuidad](../docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md). Piloto diferido hasta disponibilidad del centro: preparación técnica no equivale a puesta en producción o aceptación.
