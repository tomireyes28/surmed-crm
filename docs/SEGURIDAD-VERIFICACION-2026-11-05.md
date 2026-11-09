# Verificación de seguridad — 5 de noviembre de 2026

Base de trabajo: commit `0596b`. Al iniciar esta intervención el repositorio ya contenía correcciones de las fases 0–5. Se preservaron esas implementaciones.

## Protecciones existentes verificadas

La suite de seguridad y la aceptación HTTP comprueban la retirada del seed público, alta de usuarios con hash compatible con login, respuestas sin password, bloqueo de recepción en historias clínicas, ficha administrativa sin historias y restricciones de inventario/facturación. Las pruebas de configuración y sesión existentes también pasan.

## Cambios de esta intervención

- Política común de contraseñas en bytes UTF-8: bcrypt trunca a 72 bytes, por lo que el máximo de 72 caracteres no protegía contraseñas multibyte. Se aplica a alta, edición administrativa, login, cambio de contraseña, aprovisionamiento y demo. Se conserva el mínimo existente de ocho caracteres para claves nuevas y el ingreso con claves antiguas válidas dentro del límite.
- Validación de pertenencia del registro padre a la misma ficha clínica, antes de subir archivos o crear una evolución. Un UUID existente de otro paciente ya no permite enlazar historias distintas.
- Siete pruebas adicionales cubren límites ASCII/multibyte, rechazo antes de escribir, referencias inexistentes/de otro paciente y conservación del flujo válido.

## Resultado

| Comprobación | Resultado |
| --- | --- |
| Unitarias y regresiones backend | 46 pruebas, 7 suites, pasan |
| Aceptación HTTP | 11 pruebas pasan |
| Build backend | Pasa; generación Prisma incluida |
| Lint backend sin escritura | Pasa |
| Build frontend | Pasa; aviso existente de migración middleware → proxy |
| Git diff --check | Pasa |

Supertest necesitó ejecución fuera de la restricción de red local por errores EACCES de loopback. La suite reemplaza Prisma y Storage por implementaciones en memoria: estos resultados validan rutas, guards y flujos de aplicación, no PostgreSQL/Supabase reales. No se ejecutaron seeds, aprovisionamiento, migraciones ni escrituras en servicios del cliente.

## Aplicación operativa pendiente

- Las cuentas antiguas con passwords en texto plano no se reparan modificando código; deben revisarse y restablecerse por un procedimiento controlado. No se inspeccionaron ni alteraron cuentas existentes.
- Una contraseña histórica que exceda los 72 bytes requerirá restablecimiento: se rechaza expresamente para evitar autenticar por un prefijo truncado.
- La revocación y el rate limiting actuales son locales a memoria del proceso. No constituyen revocación durable ni límites compartidos tras reinicios o en múltiples instancias. Resolver almacenamiento compartido antes de afirmar esas garantías en producción.
- Falta verificar permisos clínicos por relación asistencial, configuración remota y recuperación operativa con el centro. ADMIN conserva el permiso de lectura clínica ya existente; el alcance de ese rol requiere validación del responsable de Surmed.

Este resultado no certifica seguridad productiva completa ni modifica el alcance de los pendientes del plan original.
