# Supabase real — staging reconstruido y verificado

Fecha: 9 de noviembre de 2026. Base del trabajo: `e3afa39`. Rama `codex/etapa-1-integridad`, sin push. El usuario confirmó que el proyecto restaurado contenía exclusivamente datos de prueba y autorizó reconstruirlo sin respaldo.

## Resultado aplicado

La conexión y Storage configurados se comprobaron contra el mismo identificador de proyecto. Se eliminaron únicamente las tablas y cinco tipos de Surmed en public y se reaplicaron las migraciones desde cero. No se eliminó el esquema public, extensiones ni los esquemas gestionados auth/storage. El reset usa una lista cerrada de tablas y DROP sin CASCADE: objetos desconocidos o dependencias externas provocan un rechazo en lugar de borrado adicional.

Estado anterior: 4 migraciones, 11 tablas sin RLS y 77 permisos de tabla para cada uno de anon/authenticated. El bucket era privado pero no tenía restricciones de tamaño/tipo ni políticas registradas.

Estado final: **13 migraciones, 17 tablas con RLS**, cero permisos de tabla en public para anon, authenticated o service_role y sin CREATE público sobre el esquema. Las migraciones nuevas son `20261109010000_private_backend_access` y `20261109020000_storage_key_cannot_access_app_tables`. La segunda también retira de las tablas de aplicación los permisos de la clave service_role usada exclusivamente por Storage.

El acceso de Nest usa ahora **surmed_app**, sin superusuario, creación de bases/roles, herencia, replicación ni BYPASSRLS. Tiene políticas RLS específicas como backend de confianza y los permisos CRUD necesarios; en audit_logs solo SELECT/INSERT. No puede leer el historial de migraciones, alterar el esquema, truncar ni modificar/eliminar auditoría. Las restricciones clínicas por usuario siguen en Nest: esta política SQL permite al backend trabajar, no autoriza al navegador ni reemplaza la relación asistencial.

La conexión administradora se conserva en MIGRATION_DATABASE_URL y se selecciona explícitamente con `prisma.migrate.config.ts`. DATABASE_URL queda para el runtime limitado. El config Prisma habitual sigue usando DATABASE_URL, evitando que un test con URL local termine migrando el Supabase remoto por una variable del archivo .env.

Se detectó un JWT_SECRET antiguo que el validador rechazaba y se reemplazó por un valor aleatorio de 48 bytes. Se generó una contraseña aleatoria para el rol SQL y se conservaron secretos solo en backend/.env, excluido de Git. La configuración local del BFF apunta al backend local y al origen localhost:3001 en frontend/.env.local, también excluido de Git. Los servidores productivos deberán recibir sus propias URLs HTTPS y secretos desde su entorno.

## Storage real

El bucket medical-records se vació con la API de Storage, conforme a la autorización sobre archivos de prueba. La eliminación fue asíncrona; el procedimiento espera su finalización y admite reanudar únicamente si las migraciones están completas y no hay datos de aplicación. No se eliminan filas de storage.objects directamente.

El bucket sigue privado, con límite de 10 MiB y MIME PDF/JPEG/PNG/WebP. El script separado `backend/ops/supabase-storage-hardening.sql` crea dos políticas **restrictivas** para anon/authenticated sobre objetos y bucket clínicos. Impiden acceso directo incluso si se agrega después una política permisiva; no conceden permisos sobre otros buckets ni bloquean el servicio del backend. Los esquemas administrados de Supabase no se incluyen en las migraciones Prisma.

Se subieron PDF y PNG sintéticos con la implementación real de StorageService; no hubo override ni almacenamiento simulado. Descargas recuperadas con igualdad de bytes/hash, URL pública rechazada y roles anon/authenticated sin filas clínicas visibles en Storage. Tras revocar un adjunto, reutilizar su URL de aplicación devuelve 403. Un fallo de auditoría inducido dentro de la transacción revierte la nota y elimina realmente el objeto recién subido de Supabase.

La conciliación final encontró **4 objetos y 4 metadatos, cero archivos faltantes y cero huérfanos**. Incluyen muestras activas y revocadas de las dos ejecuciones de integración. La revocación no elimina el objeto ni retira copias ya descargadas; bloquea nuevas descargas desde la aplicación. No se emitieron nuevos enlaces firmados de Storage.

La Data API no se desactivó desde el panel ni se cambiaron ajustes de la organización: se cerró el acceso a las tablas por permisos y RLS. Se comprobó HTTP **403** en `/rest/v1/users` incluso usando la clave de servicio de Storage. Los permisos de Storage se conservan; sus archivos siguieron funcionando después de ese cierre.

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| Supabase real, Nest y Next de producción | 14 comprobaciones pasan en la configuración final |
| PostgreSQL local, integridad de etapa 1 | 19 comprobaciones pasan con ambas migraciones nuevas |
| PostgreSQL local, permisos/RLS | Pasa con anon/authenticated/service_role simulados y rol limitado |
| PostgreSQL local, seguridad y BFF de producción | 18 comprobaciones pasan |
| PostgreSQL local, actualización con datos y consultas/fechas | 6 comprobaciones pasan |
| Backend | Build, lint y 62 unitarias / 10 suites pasan |
| Regresión HTTP | 11 pruebas pasan |
| Frontend | Build, lint, typecheck y 7 pruebas de fechas/PDF pasan |

Las 14 comprobaciones reales cubren migraciones/RLS/grants, denegación REST, rol SQL no administrativo y auditoría sin mutación; bootstrap de ADMIN y provisión por API de los otros roles; pacientes/fecha civil/permisos clínicos; rechazo de archivos falsos/grandes; PDF/PNG reales; descarga privada por paciente; revocación/adenda; compensación real; stock concurrente/idempotencia; comprobantes/pago/anulación/indicadores; agenda/replay/conflictos/transiciones; recuperación de un uso y revocación de sesiones; inactividad/desactivación/reactivación y auditoría redactada; BFF de producción con cookie HttpOnly/Secure/SameSite y adjunto de Supabase real.

El driver pg mantiene un aviso de deprecación preexistente sobre consultas simultáneas en un cliente, sin fallos de comprobaciones. Se repitieron las 18 comprobaciones de seguridad y las seis de entrega con las 13 migraciones; la actualización preservó paciente, nota clínica y sesión existentes. No se repitió aquí el recorrido visual de navegador: conserva su evidencia anterior. Esta integración usa HTTP local de Nest/Next con servicios Supabase remotos; no acredita hosting productivo público ni HTTPS de ese despliegue.

La evidencia de metadatos y conciliación, sin secretos ni identificador del proyecto, está en [supabase-staging-verificacion.json](evidencia/supabase-staging-verificacion.json). CI incorpora la prueba de permisos sobre PostgreSQL descartable y simula los grants públicos previos antes de migrar. No usa Supabase real ni sus credenciales y no se ejecutó remotamente porque no se hizo push.

## Acceso local y comandos

Los usuarios sintéticos y contraseñas aleatorias de la última ejecución se guardan en **backend/.tmp/staging-access.json**, fuera de Git. Hay ADMIN, ADMIN de respaldo, MEDICO, otro médico con acceso clínico revocado y RECEPCION. Los datos se identifican como prueba; no se cargó ninguna radiografía personal. No reutilizar estas cuentas en producción.

Para abrir la app con este staging: ejecutar `npm run start:dev` desde backend y `npm run dev -- --port 3001` desde frontend, luego visitar localhost:3001. Las URLs ya están en los archivos locales ignorados. También puede usarse build/start con esos puertos; no quedan servidores de prueba escuchando tras las comprobaciones.

Las futuras migraciones de este entorno se aplican desde backend con:

```powershell
npx prisma migrate deploy --config prisma.migrate.config.ts
```

No usar migrate dev, db push o un reset para actualizar producción. Toda tabla futura requiere grants/política del runtime y cierre de los roles API en su migración. El rol migrador sigue siendo administrador del proyecto y puede modificar la base: no existe protección absoluta frente a ese administrador.

Operaciones reproducibles, únicamente para el proyecto descartable explícito:

```powershell
$env:SURMED_STAGING_PROJECT_REF='identificador_del_proyecto_de_pruebas'
$env:SURMED_RESET_TEST_DATA='discard-test-data'
npm run staging:reset  # destructivo: elimina datos y objetos de prueba
# --resume solo completa un reset ya migrado y todavía sin datos de aplicación
# npm run staging:reset -- --resume
$env:TEST_BFF='1'       # requiere frontend compilado y puerto 55602 libre
npm run staging:verify # agrega datos sintéticos, no vuelve a vaciar la base
```

El guard exige que coincidan identificador explícito, URL de Storage y conexión PostgreSQL Supabase del esquema public por puerto directo/session 5432. El reset no está pensado para producción. Un fallo de migración puede dejar el staging incompleto: inspeccionar y resolver antes de continuar; no dar por confirmada toda la operación porque una fase terminó. Las contraseñas rotadas se guardan antes de comprobar conexión, para no perderlas si el pool tarda en actualizar su autenticación.

## Estado de cierre

La integración real pendiente de la etapa 3 queda verificada en el proyecto de pruebas configurado. Continúan la preparación y aceptación de producción: propiedad/cuenta corporativa, entorno público y HTTPS, secretos y roles propios, decisión de MFA, respaldo/restauración de base y archivos con tiempos medidos, comprobación en equipos reales, datos iniciales aprobados, capacitación, piloto y soporte. No se hizo respaldo de esta demo por instrucción expresa; eso no elimina la validación de continuidad exigida para producción.
