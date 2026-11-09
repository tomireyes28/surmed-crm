# Surmed — entrega técnica del proyecto

Aplicación para un centro médico de Paraguay, preparada con datos sintéticos. Estado al 9 de noviembre de 2026: implementación y validación técnica entregadas para el alcance revisado; publicación y piloto diferidos hasta disponibilidad del establecimiento.

Pacientes, agenda por profesional, evoluciones/adendas con adjuntos privados, accesos clínicos, personal/especialidades, inventario/movimientos, comprobantes internos, cobros/anulaciones e indicadores. Recuperación administrativa con enlace de un uso y sesiones persistentes. Sin integración de facturación fiscal ni firma digital clínica.

| Rol | Alcance |
| --- | --- |
| ADMIN | Gestión administrativa, personal, accesos y auditoría; sin leer historias |
| MEDICO | Pacientes asignados o con turnos propios, evoluciones/adendas y adjuntos autorizados |
| RECEPCION | Operación administrativa permitida, sin historias |

Next.js 16/React 19/TypeScript, NestJS 11, Prisma 7, PostgreSQL y Supabase Storage privado. El navegador usa BFF con cookie HttpOnly; SQL y claves Storage permanecen en servidor. Docker y receta de despliegue separan runtime de operaciones privilegiadas.

Evidencia:

- Integridad/concurrencia/idempotencia/indicadores en PostgreSQL real; migraciones con datos preservados y regresiones de permisos/sesiones.
- [Revisión visual de tres roles, móvil/escritorio y PDF](auditoria-2026-11-09/QA-VISUAL-Y-PDF.md).
- [Supabase de pruebas](auditoria-2026-11-09/SUPABASE-STAGING.md): 13 migraciones, 17 tablas con RLS, SQL limitado y adjuntos reales.
- [Recuperación cifrada y ejecución con imágenes productivas](auditoria-2026-11-09/ETAPA-4-PREPARACION.md).
- [Instalación, backup, rollback y condiciones para publicar](../deploy/README.md).

Antes de apertura: hosting/dominio/HTTPS, cuentas institucionales, respaldo externo programado, monitoreo y secretos definitivos; validar equipos/infraestructura, capacitar y obtener aceptación del dueño/responsable clínico. No reutilizar datos/accesos de demo. No se afirma publicación ni piloto realizado.
