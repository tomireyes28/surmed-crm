# Etapa 1 — integridad implementada y verificada

Fecha: 8 de noviembre de 2026. Trabajo sobre `38829d3`, conservando los documentos de revisión que ya estaban sin confirmar en Git. No se modificaron datos ni configuración del cliente.

## Cambios

- **Historia, adjuntos y auditoría:** registro clínico, metadatos y evento se confirman en una transacción. Las adendas también incluyen auditoría transaccional. Ante un error se consulta si el objeto quedó referenciado antes de compensar su subida. Si el commit ocurrió pero se perdió la confirmación, se recupera el registro confirmado y se conserva el archivo. Si no puede comprobarse el estado o eliminar el objeto, se conserva para conciliación y se emite un error operativo; no se borra a ciegas. Storage ahora comprueba también los errores retornados por Supabase, no solo excepciones.
- **Agenda:** creación y transiciones usan transacciones serializables con reintentos acotados. Se retiraron bloqueos Map locales y caminos que omitían validaciones cuando faltaban métodos en dobles. Se verifica la superposición tanto para médico como para paciente, también entre conexiones de instancias diferentes. Intervalos contiguos siguen permitidos.
- **Stock:** se conserva la actualización condicional y su transacción, con coordinación serializable y sin fallback no atómico. Movimiento y saldo se confirman juntos.
- **Cobros y anulaciones:** cambio de estado y auditoría se confirman juntos. Dos operaciones concurrentes no sobrescriben sus validaciones. Emisión con pago inmediato genera su evento de auditoría.
- **Idempotencia:** turnos, comprobantes y movimientos guardan una huella SHA-256 del contenido normalizado y del actor. La clave es única dentro de cada tipo de recurso: reutilizarla desde otro usuario o con otro contenido devuelve 409. Dos peticiones equivalentes concurrentes retornan el mismo recurso. Claves contradictorias entre header/body o de más de 120 caracteres se rechazan. La API de turnos transmite al servicio el actor autenticado.
- **Indicadores:** cobrado del mes usa `paidAt`; emitido del mes usa `createdAt` excluyendo anuladas. El campo existente `monthlyPending` conserva su nombre por compatibilidad, pero representa el saldo pendiente actual de todos los períodos con emisión hasta ahora. No se fuerza que cobrado + pendiente = emitido del mes, porque corresponden a bases temporales diferentes. Una anulación antigua con `paidAt` registrado no se trata como devolución de dinero.
- **Importes:** subtotal y total se validan contra el máximo representable de Decimal(12,2), antes de escribir.
- **Credenciales y administradores (parte transaccional de R08):** cambio/reset de contraseña y revocación de sesiones comparten transacción. Login también registra su sesión dentro de una transacción serializable que leyó las credenciales, para cerrar la carrera con un cambio simultáneo. Desactivar/degradar administradores coordina la consulta y actualización sin dejar al centro sin uno activo.

## Cambios de comportamiento deliberados

1. **Un comprobante PAID no puede anularse como una deuda pendiente.** Devuelve 409 con explicación de que requiere un procedimiento de devolución. Se conserva la anulación de PENDING y se verifica su recorrido HTTP. No se implementó una devolución bancaria ni se inventó un flujo de reembolsos.
2. Una clave antigua sin huella verificable devuelve 409; no se afirma que corresponda al nuevo contenido ni se repite silenciosamente la operación. Ante ese conflicto se debe verificar el registro existente antes de intentar una nueva operación.
3. Los comprobantes históricos PAID que no tengan `paidAt` necesitan conciliación de su fecha real de cobro. No se inventó esa fecha a partir de `createdAt` ni se alteraron sus datos en producción.

## Verificación realizada

| Control | Resultado |
| --- | --- |
| Jest backend | 51 pruebas / 8 suites pasan |
| Aceptación HTTP | 11 pruebas pasan: auth, roles, pacientes, clínica, turnos, inventario y cobros |
| Build y lint backend | Pasan |
| Build y lint frontend | Pasan; aviso preexistente middleware → proxy |
| Migraciones | Nueve migraciones aplicadas desde cero sobre PostgreSQL 17.6 temporal |
| Integración real | 19 comprobaciones pasan con dos PrismaService/pools independientes |

Las 19 comprobaciones reales cubren: reserva simultánea del mismo médico, paciente con médicos diferentes, intervalo contiguo, reintentos concurrentes y conflictos de contenido/actor en los tres recursos, transiciones terminales de agenda, salidas de stock simultáneas, pago contra anulación, fallo de auditoría clínica/financiera, pago inmediato, cobro actual de deuda antigua, límites de importe, fallo real de FK y compensación, adenda revertida, confirmación de commit perdida, atomicidad password/revocación, login contra cambio de contraseña y desactivación concurrente de los últimos administradores.

Los fallos clínicos usan PostgreSQL real para registros/metadatos/auditoría y un almacenamiento de objetos simulado: **no certifican el comportamiento de Supabase desplegado**. Para provocar fallos de auditoría se inyecta una excepción dentro de la transacción y se comprueba el rollback real. El test de FK provoca un rechazo real de PostgreSQL. Los dos pools evitan inferir coordinación entre instancias a partir de un mutex del proceso.

El adaptador pg emitió una advertencia de deprecación sobre consultas concurrentes para una futura versión mayor pg@9; las pruebas concluyeron correctamente con las versiones instaladas. No se cambiaron dependencias en esta etapa.

## Cómo repetir la integración

1. Crear un PostgreSQL local descartable con base llamada exactamente `surmed_integrity_test`.
2. Aplicar migraciones a esa base y ejecutar `npm run build` en backend.
3. Establecer `INTEGRITY_TEST_DATABASE_URL` con esa URL y ejecutar `npm run test:postgres` desde backend.

El script `backend/test/integrity-postgres.cjs` rechaza hosts que no sean localhost/127.0.0.1 o una base con otro nombre. **Trunca los datos de esa base de pruebas** al comenzar para que sea repetible; nunca se debe apuntar a una base del cliente. El contenedor temporal usado en esta intervención se elimina al terminar. La suite HTTP sigue usando dobles para datos; los tests de PostgreSQL son independientes y no están agregados automáticamente al CI en esta etapa.

## Activación en un entorno real

- Aplicar `20261108010000_request_fingerprints` mediante `prisma migrate deploy` antes de arrancar el backend nuevo; regenerar Prisma/compilar y actualizar todas las instancias.
- No mezclar servidores antiguos que no apliquen las mismas transacciones y validaciones con los nuevos.
- Revisar fechas de cobro históricas y explicar al equipo la diferencia entre anulación y devolución.
- Probar Storage y procedimientos de conciliación en staging y asegurar observabilidad de compensaciones fallidas.

No se aplicó ninguna migración en producción ni se ejecutó aprovisionamiento, importación o seed del cliente.

## Estado del plan

Se cierra la implementación de **etapa 1** (R01, R02, R03, R05 y parte transaccional de R08) con las verificaciones descritas. Continúan las etapas 2–4 del plan: decisiones de permisos clínicos/recuperación/sesión, revocación efectiva de adjuntos, controles operativos, documentación, staging y piloto. No se certifican como terminadas por estas pruebas.
