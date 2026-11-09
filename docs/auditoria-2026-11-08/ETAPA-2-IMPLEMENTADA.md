# Etapa 2 — permisos, recuperación, sesiones y adjuntos

Fecha: 8 de noviembre de 2026. Rama `codex/etapa-1-integridad`. Cambios locales y commits sin push. No se modificaron la base del cliente ni Supabase remoto.

## Política aprobada e implementada

- ADMIN gestiona asignaciones y revocaciones, con motivo auditado, sin leer historias ni descargar adjuntos.
- MEDICO necesita una asignación activa o al menos un turno propio no cancelado del paciente. Los turnos históricos también cuentan. Puede leer la historia del paciente, no solamente sus propias notas. Una revocación explícita prevalece sobre cualquier turno hasta una nueva asignación.
- RECEPCION conserva ficha administrativa y agenda, sin acceso clínico. Un médico sin acceso clínico conserva la ficha administrativa; la interfaz muestra la restricción clínica.
- ADMIN verifica identidad fuera del sistema y registra el motivo antes de generar un enlace de recuperación. El software registra la declaración; no verifica documentos automáticamente ni envía mensajes.

## Correcciones

**Recuperación:** token aleatorio de 256 bits, hash SHA-256 en base, vencimiento de 15 minutos y canje transaccional serializable. Un nuevo enlace invalida los anteriores. El canje concurrente tiene un solo ganador, cambia la contraseña y revoca todas las sesiones/enlaces existentes. Un usuario inactivo no puede canjear. Cambio de contraseña, reset administrativo y desactivación invalidan también los enlaces pendientes. El token se entrega una vez en la respuesta administrativa; la interfaz lo usa en el fragmento de URL y lo retira al abrir la página. No se guarda en localStorage ni en auditoría.

**Sesiones:** el navegador usa `/api/backend` en Next. El BFF conserva el JWT en cookie `surmed-session`, HttpOnly, SameSite strict y Secure en producción. El JSON de login web ya no incluye el JWT. Las escrituras requieren origen exacto y header no simple. El BFF limita el cuerpo, limita las rutas reenviadas, transmite idempotencia y no acepta bearer aportado por el navegador como alternativa a la cookie. La API sigue verificando JWT, usuario, sesión y permisos. `proxy.ts` solo orienta navegación, no sustituye esa autorización.

La API comprueba y actualiza atómicamente `lastSeenAt` en PostgreSQL: más de 30 minutos sin solicitudes autenticadas invalida la sesión aunque se reinicie el proceso. Un logout confirmado revoca y limpia cookie; ante fallo de API la UI informa que debe reintentarse. Un fallo de verificación inicial muestra reintento, evitando bucles de redirección y renderizado de pantallas privadas antes de confirmar sesión.

**Límites:** intentos reservados atómicamente en PostgreSQL, compartidos entre procesos. Ventana fija de 15 minutos, 5 intentos por cuenta y 100 por IP; éxito limpia el contador de cuenta, no el de IP. Recuperación limita a 5 intentos por IP en esa ventana. Se limpian buckets vencidos. No se confía en `X-Forwarded-For` aportado por clientes. Detrás del BFF, la IP observada puede ser la de Next y el límite de IP se comparte: revisar volumen y proxy de confianza en staging, sin desactivar el límite por cuenta.

**Adjuntos:** la historia devuelve rutas de aplicación por ID, sin tokens firmados de Storage. Cada descarga revalida sesión, relación asistencial y estado de revocación, y se audita. El médico autorizado puede revocar con motivo desde la ficha; una URL copiada deja de permitir nuevas descargas. La descarga fuerza disposición attachment y usa no-store/nosniff en el BFF. Una descarga ya iniciada o una copia descargada no se puede retirar del equipo del usuario.

Se verifica que el bucket esté configurado como privado antes de subir/descargar. Los archivos históricos sin metadatos se recuperan y validan por tamaño/MIME/firma antes de registrar metadatos y habilitar su enlace; los faltantes o inválidos quedan como no disponibles, con aviso para conciliación. Una lectura posterior no reconstruye un adjunto revocado. `CLEAN_MAGIC_VERIFIED` significa validación de formato, **no análisis antimalware**.

## Verificación ejecutada

| Control | Resultado |
| --- | --- |
| Unitarias backend | 54 pruebas / 9 suites pasan |
| Regresión HTTP Nest | 11 pruebas pasan con dobles Prisma/Storage |
| Regresión de etapa 1 | 19 comprobaciones pasan con PostgreSQL real y dos pools independientes |
| Seguridad etapa 2 | 18 comprobaciones pasan con PostgreSQL real, API HTTP y Next en producción local |
| Backend y frontend | Build y lint pasan |
| Migraciones | Las 10 migraciones se aplicaron desde cero en PostgreSQL 17.6 temporal |

Las 18 comprobaciones de seguridad cubren roles y relación clínica, concesión/revocación, descarga por ID y rechazo por otros roles, URL copiada tras revocación, adjuntos históricos, tokens hasheados/reemplazados/vencidos, canje concurrente único, login con nueva contraseña y rechazo de la anterior, revocación e inactividad persistentes con otro pool, cuotas compartidas concurrentes y limpieza, cookie/JSON reales del BFF, subida multipart y descarga binaria, CSRF, rechazo de bearer alternativo, logout y caída de API. La prueba unitaria del bucket público comprueba rechazo antes de descargar.

La base fue un contenedor temporal publicado solo en loopback. Los adjuntos usaron objetos simulados con la validación real de formatos. Las comprobaciones de Next se hicieron por HTTP con Node e inspección de cabeceras; no son automatización de navegador ni QA visual. No certifican políticas remotas de Supabase. El driver pg emitió un aviso de deprecación sobre consultas simultáneas en un cliente en la suite de integridad; no hubo fallos de comprobaciones.

Para reproducir con bases locales descartables ya migradas y backend compilado:

```powershell
# Nunca usar DATABASE_URL del cliente para estas pruebas.
$env:INTEGRITY_TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_integrity_test'
npm run test:postgres
$env:SECURITY_TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_security_test'
$env:TEST_BFF='1' # requiere frontend previamente compilado
npm run test:security
```

Ejecutar desde `backend`. Los scripts se niegan a truncar salvo en localhost/127.0.0.1 y los nombres exactos de base de prueba indicados. La suite BFF usa el puerto local 55602. No ejecutar ambas suites sobre una misma base ni reutilizar bases con datos útiles.

## Despliegue y cierre pendiente

1. Backup y migración `20261108020000_clinical_access_and_recovery` mediante `prisma migrate deploy`, regeneración Prisma y despliegue coordinado de API/Next. No se aplicó en producción. Las cookies antiguas dejan de servir para la web; los usuarios deberán volver a iniciar sesión.
2. Configurar `API_URL` del lado servidor y `APP_ORIGIN` con el origen HTTPS público exacto. Sin `APP_ORIGIN` las escrituras de producción fallan cerradas. Asegurar HTTPS; cookie Secure requiere ese transporte. Mantener secretos Supabase/JWT exclusivamente en backend.
3. Preparar asignaciones si hay médicos que deben atender pacientes aún sin turnos propios. Probar grant/revoke y recuperación con usuarios individuales de los tres roles en staging.
4. Confirmar bucket privado, políticas que impidan acceso anónimo y por usuarios externos, credenciales y rutas históricas con Supabase real. Las URLs firmadas emitidas por la versión anterior conservan su validez hasta su vencimiento original (normalmente 15 min); dejar transcurrir esa ventana antes de acreditar la nueva garantía de revocación.
5. Validar privilegios mínimos del rol PostgreSQL y retención/auditoría con infraestructura real. No se añadieron restricciones contra un administrador de base ni firma digital de notas. Definir mantenimiento de sesiones y tokens históricos según conservación acordada.
6. MFA e invitaciones no están implementados. La recuperación acordada ya funciona; MFA administrativo queda como decisión explícita antes de exponer públicamente, junto con los controles de entrada/proxy. Tener al menos dos administradores individuales habilitados evita depender de un único operador para recuperación.
7. Continuar etapa 3: consultas acotadas, fechas/calendario, CI con PostgreSQL/HTTP, instalación y actualización con datos representativos, QA visual y PDF, Supabase real. Etapa 4 conserva piloto, restauración medida, capacitación y aceptación del cliente.

Estas condiciones distinguen código verificado de infraestructura desplegada y aceptación del centro; no se declara el proyecto listo para producción solo por estas pruebas locales.
