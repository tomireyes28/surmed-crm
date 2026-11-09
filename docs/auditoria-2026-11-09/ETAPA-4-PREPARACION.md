# Etapa 4 — recuperación verificada y preparación de producción

Fecha: 9 de noviembre de 2026. Base 068f7e7d, rama codex/etapa-1-integridad. Trabajo local sin push. El centro no está operativo ni el sistema publicado; el usuario pidió preparar el proyecto y diferir el piloto. No se contrataron servicios ni contactó personal.

## Recuperación real

Se respaldó la demo Supabase y se restauró public de Surmed en PostgreSQL 17 local vacío y los bytes en un bucket privado nuevo separado del original. Copia cifrada en backend/.tmp/backups, fuera de Git; clave del ensayo en .tmp/backup-drill-key.txt. Son datos sintéticos. La custodia productiva debe separar backup y clave.

Pasaron **12 comprobaciones**: mantenimiento obligatorio, exportación cifrada real, clave incorrecta rechazada, manipulación rechazada antes de escribir, bloqueo de destino remoto/bucket original, restauración y hashes completos, rechazo de overwrite, revocados/RLS/grants, login de tres roles con SQL limitado, adjunto restaurado por Nest y Storage reales con permisos negativos, logout/invalidez y preservación del origen.

Se compararon **17 tablas, 121 filas y 4 archivos, incluidos 2 revocados**, sin huérfanos: [evidencia y tiempos](evidencia/etapa-4-restauracion.json). Huellas de todas las filas y SHA-256 de cada archivo, no solo cantidades. El bucket temporal se retiró y la base restaurada se usó después para probar contenedores. Los tiempos de esta muestra pequeña no representan RTO completo de incidente/infraestructura/DNS ni RPO acordado.

Cambios:

- backup:create usa snapshot SQL compartido con inventario de filas, dump custom y objetos cifrados AES-256-GCM; detecta referencias faltantes/hash incorrecto, preserva huérfanos y escribe manifiesto al final. No pausa servicios: exige detener escritores y confirmarlo.
- backup:restore-test autentica todo antes de modificar; solo base local vacía y bucket nuevo, sin overwrite/reset/CASCADE. Conserva destinos parciales ante fallo. No restaura producción remota automáticamente.
- backup:verify incluye metadatos revocados, pagina recursivamente y falla sin credenciales o con errores de páginas. Pasó de nuevo con cuatro referencias/cuatro objetos. Es conciliación, no sustituye el simulacro.
- StorageService admite SUPABASE_MEDICAL_BUCKET por configuración de servidor, default medical-records. Permitió descargar el archivo realmente restaurado sin reemplazar el servicio por un doble. El preflight productivo exige el bucket esperado.

El ensayo detectó el conflicto de public precreado frente a CREATE SCHEMA del dump: se corrigió retirando solo el esquema vacío local, sin CASCADE. Se retiró el bucket vacío del primer intento. Un archivo corrupto de prueba fue rechazado antes de restaurar. No se copiaron auth/storage, claves, roles globales/contraseñas ni configuración del proveedor: requieren custodia/recreación separadas.

## Producción preparada, sin publicación

Dockerfiles multistage: backend con dependencias productivas y Prisma generado; Next standalone con assets. Ambos como node, sin .env. Compose: backend sin puertos públicos, web en loopback; filesystem read-only, tmpfs, capabilities retiradas, reinicio, cierre ordenado, healthchecks y logs rotados.

Ambas imágenes se construyeron en Linux desde npm ci y se ejecutaron juntas. Pasaron **5 comprobaciones**: salud/aislamiento, Next/origen/sesión, login de tres roles/cookies, archivo Supabase real con hash/permisos y logout que invalida cookie. Healthcheck web ajustado a /, ruta real del login. Ver [evidencia Docker](evidencia/etapa-4-contenedores.json).

Contenedores: SQL local restaurado y archivos sintéticos originales. Por separado, el simulacro comprobó el bucket restaurado. Cookies enviadas manualmente por HTTP loopback para inspeccionar BFF; no acredita navegador/TLS en dominio público. PostgreSQL local no usó TLS; preflight lo exige para SQL remoto productivo.

production:check valida archivos estáticamente: rol limitado/TLS/JWT fuerte, origen HTTPS/CORS, API privada/HTTPS, Swagger apagado, bucket esperado y ausencia de secretos operativos en runtime/frontend. No autentica credenciales ni certifica infraestructura. Ejemplos con placeholders rechazados, sin inventar dominio del centro.

La [receta de producción](../../deploy/README.md) cubre instalación, migrador separado, roles/bootstrap, Storage, build por commit, proxy HTTPS de ejemplo, rollback, backups, recuperación, monitoreo y condiciones de apertura.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Backup/restore con Supabase real + PostgreSQL local | 12 pasan |
| Imágenes productivas y Compose | Ambas compilan; 5 pasan |
| Preflight/listado >1000 objetos/error posterior | 7 pruebas pasan |
| Backend | 62 unitarias/10 suites, lint y build pasan |
| Regresión HTTP | 11 pruebas pasan |
| Frontend | 7 pruebas, lint, typecheck y build Linux pasan |
| Conciliación demo | 4 referencias/4 objetos, sin discrepancias |
| npm audit productivo backend/frontend | 0 vulnerabilidades reportadas en ambos |

La instalación mantiene avisos/advisories de herramientas dev; no equivalen al audit productivo. Sin upgrades forzados; backend final elimina dependencias dev. No aceptar archivos desconocidos en imports CLI. Esto no acredita pentest ni ausencia absoluta de vulnerabilidades. CI agrega las siete pruebas de operaciones y construcción de ambas imágenes, sin claves remotas ni publicación. Simulacro y prueba integrada de contenedores requieren preparación explícita. Actions remoto no ejecutado porque no se hizo push. El resumen de audit está en [evidencia](evidencia/etapa-4-audit-produccion.json).

## Cierre actual y trabajo diferido

La **preparación técnica solicitada** queda entregada y reproducible. No hay hosting desplegado, HTTPS real verificado, cron de backups externo, receptor de alertas, datos reales ni aceptación clínica.

Al habilitar apertura: cuenta institucional/responsables, contratación/DNS/TLS/secretos nuevos, permisos desde hosting, backups externos/custodia/alertas, ensayo con volumen representativo, cuentas/datos iniciales, equipos/conectividad/contingencia, capacitación y piloto. MFA proveedor se habilita en su cuenta; MFA usuarios app sigue como decisión/alcance pendiente, no función implementada.

Piloto, aprobación del dueño y operación diaria quedan diferidos hasta disponibilidad del centro. No impiden mostrar el proyecto con datos sintéticos; sí impiden afirmar que está operando en el establecimiento.
