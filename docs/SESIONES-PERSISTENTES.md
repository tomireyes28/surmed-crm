# Sesiones persistentes

Implementado el 5 de noviembre de 2026.

La tabla `auth_sessions` guarda JTI, usuario, vencimiento y revocación. No guarda el JWT ni la contraseña. Login firma el token y persiste la sesión antes de devolverlo; la validación consulta PostgreSQL en cada petición, sin caché local. Logout espera la escritura. La revocación por usuario afecta sus sesiones existentes y permite iniciar una nueva inmediatamente, incluso dentro del mismo segundo.

Las instancias comparten el estado de PostgreSQL: reiniciar un proceso no recupera sesiones cerradas. Si falla la consulta no se autoriza por defecto; si falla guardar una sesión o revocarla, no se informa éxito.

## Despliegue

1. Aplicar las migraciones con `prisma migrate deploy` en el entorno de destino antes de arrancar la versión nueva. La migración nueva es `20261105010000_persistent_auth_sessions`.
2. Regenerar Prisma y compilar con `npm run build`.
3. Reiniciar todas las instancias del backend con esta versión. No mantener instancias antiguas que solo consulten memoria.
4. Los tokens anteriores al despliegue no tienen sesión registrada: los usuarios deben volver a iniciar sesión. No importar tokens antiguos como sesiones activas, porque su revocación previa en memoria no es recuperable.

No se aplicaron migraciones sobre la base del cliente. Solo se ejecutaron contra una base temporal de pruebas con datos sintéticos.

## Verificación

- 51 pruebas unitarias/regresión y 11 de aceptación HTTP pasan.
- Build y lint de backend pasan.
- Las ocho migraciones se aplicaron desde cero en PostgreSQL 17.6 temporal.
- `backend/test/session-persistence.cjs` ejecutó login, validación tras recrear el proceso, logout selectivo, rechazo del token revocado, conservación de otra sesión, revocación global y nuevo login contra PostgreSQL real. Cada operación se ejecutó en un proceso Node independiente; no se compartió memoria de aplicación.
- Pruebas adicionales cubren expiración, JTI ausente/desconocido, usuario incorrecto y fallos de persistencia.

Para repetir la prueba real: crear una base local descartable llamada exactamente `surmed_sessions_test`, aplicar migraciones, compilar backend y ejecutar `node test/session-persistence.cjs` desde backend con `SESSION_TEST_DATABASE_URL` apuntando a esa base. El script rechaza destinos que no sean locales o con otro nombre y escribe solo datos sintéticos. No usar credenciales del cliente.

## Operación

Mantener los registros al menos mientras el JWT pueda ser válido. Puede programarse eliminación de filas cuyo `expiresAt` ya pasó; la falta de una fila siempre invalida el token. No borrar sesiones activas como tarea de mantenimiento. El índice de vencimiento permite esa limpieza sin depender del proceso de autenticación. Las filas históricas no se eliminan automáticamente en cada petición.

Este cambio resuelve la revocación durable. El rate limiting de login sigue siendo local al proceso y queda como tarea independiente.
