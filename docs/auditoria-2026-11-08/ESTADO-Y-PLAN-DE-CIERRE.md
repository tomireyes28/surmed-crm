# Surmed: revisión actualizada y plan de cierre

> Actualización posterior: la etapa 1 fue implementada y verificada. Ver [Etapa 1 implementada](ETAPA-1-IMPLEMENTADA.md) para cambios, resultados y condiciones de despliegue. Los hallazgos siguientes conservan el diagnóstico previo a esa implementación.

> Etapa 2: política clínica y recuperación aprobadas por el usuario e implementadas, sesiones HttpOnly, límites persistentes y descargas revocables. Ver [Etapa 2 implementada](ETAPA-2-IMPLEMENTADA.md) para las pruebas ejecutadas y los pendientes operativos. El diagnóstico histórico de R04/R06 de abajo ya no describe el código actual. El próximo trabajo es la etapa 3; los privilegios del rol de base y las políticas reales de Supabase todavía requieren validación en staging.

> Etapa 3: implementados los límites y paginación de agenda/historias/inventario, calendario en hora del centro, validación estricta de fechas, CI con PostgreSQL/HTTP/BFF y actualización con datos previos, y documentación operativa corregida. Ver [Etapa 3 implementada](ETAPA-3-IMPLEMENTADA.md). Las filas y estimaciones históricas siguientes se conservan como diagnóstico; no reabren las correcciones de las etapas 1–3. Pendientes de entrega: staging/Supabase, revisión visual/PDF y aceptación/piloto, sin acreditar despliegue por las pruebas locales.

Fecha: 8 de noviembre de 2026. Commit revisado: `38829d3380a95dfd391ce1a0957a9fea14740c9c`. Árbol de trabajo limpio antes de la revisión. Esta intervención agrega documentación y reproducciones; no modifica la aplicación.

## Dictamen

El proyecto avanzó sustancialmente desde el 4 de noviembre. Ya se resolvieron los bloqueantes iniciales de credenciales, exposición de contraseñas, permisos de recepción sobre historias clínicas, compilación y arranque del paquete. Hay sesiones persistentes, pagos separados de deuda, importes Decimal, validación de archivos, migraciones, pruebas y CI.

**No corresponde repetir el plan inicial completo ni declarar todo terminado.** Quedan defectos de integridad, controles de seguridad parcialmente implementados y validaciones operativas por demostrar. El cierre debe concentrarse en esos pendientes, sin incorporar módulos comerciales nuevos.

Los commits describen implementaciones de fases 0–5 y seguridad persistente. Se evalúa su resultado actual, sin atribuir a una herramienta determinada la autoría de cada cambio.

## Evidencia de esta revisión

| Comprobación ejecutada | Resultado actual |
| --- | --- |
| Backend: pruebas unitarias y de dominio | 51 pruebas, 8 suites, pasan |
| Backend: aceptación HTTP | 11 pruebas pasan, con Prisma y Storage simulados |
| Backend: lint sin escritura y build | Pasan; generación Prisma incluida y entrypoint `dist/main.js` generado |
| Frontend: lint, typecheck y build | Pasan; build requiere descargar Google Fonts y mantiene aviso middleware → proxy |
| npm audit de producción, backend | 0 vulnerabilidades reportadas |
| npm audit de producción, frontend | 0 vulnerabilidades reportadas |
| Nuevas reproducciones aisladas | 3 comportamientos confirmados; ver script y evidencia |

El primer build frontend falló por acceso a Google Fonts; con acceso de red pasó. No fue un error de tipos o código. La consulta del backend a npm necesitó autorización adicional del usuario, que fue concedida. Los JSON de ambas auditorías se conservaron en `evidencia/`.

Los conteos de npm cubren el árbol con `--omit=dev`: no certifican ausencia de fallas en el código ni saneamiento de todas las herramientas de desarrollo. `xlsx` permanece en devDependencies para el importador: debe tratarse por separado si se reciben archivos no confiables.

Se revisaron los dominios y sus contratos, frontend, auth, adjuntos, auditoría, migraciones, CI y documentos de operación. No se hizo QA visual en navegador, pentest de infraestructura ni acceso a producción/Supabase. La prueba de sesiones con PostgreSQL real del 5 de noviembre es evidencia histórica conservada; no se volvió a ejecutar en esta intervención. Las suites HTTP actuales no demuestran concurrencia real entre conexiones PostgreSQL.

## Estado de los hallazgos originales

“Resuelto en código” no equivale a “desplegado y aceptado por el cliente”. Los pendientes operativos se separan al final.

| ID original | Estado actual | Resultado de la revisión |
| --- | --- | --- |
| S01 · Administrador público | Resuelto en código | No existe GET seed; hay comando CLI. Falta confirmar tratamiento de cuentas históricas en el entorno real. |
| S02 · Passwords sin hash | Resuelto en código | Hash en alta/cambio/demo/provisión; límite bcrypt en bytes. Usuarios antiguos no se reparan retroactivamente. |
| S03 · Acceso clínico | Parcial | Recepción bloqueada por backend y UI; ficha administrativa sin historias. Falta política por relación asistencial y aprobación del acceso clínico de ADMIN. |
| S04 · Password en respuestas | Resuelto en caminos revisados | Selecciones públicas en usuarios y relaciones de médicos; pruebas pasan. |
| S05 · PATCH sin validación | Resuelto en código | DTO concretos y mapeo explícito; stock directo rechazado. |
| S06 · Sesión/configuración | Parcial | Sin secreto fallback; sesión persistente y manejo 401. JWT sigue en cookie accesible a JS; recuperación, invitación y MFA no implementados. |
| S07 · Archivos | Parcial | Tamaño/tipos/magic bytes/hash/URLs temporales; queda consistencia ante fallo de auditoría, revocación efectiva y prueba remota del bucket. |
| S08 · Endurecimiento/trazabilidad | Parcial | CORS configurable, Swagger condicionado, logs y auditoría. Rate limit local y auditoría fuera de transacciones; ver pendientes. |
| F01 · Build frontend | Resuelto | Build y typecheck pasan. |
| F02 · Selects paginados | Resuelto en código | Turnos/facturas consumen data y permiten búsqueda; turno admite preselección por ID. |
| F03 · Entrypoint backend | Resuelto | Build genera dist/main.js y start:prod apunta a él; CI comprueba su existencia. No se arrancó contra producción. |
| F04 · Migraciones faltantes | Resuelto en repositorio, operación pendiente | Migraciones de flags, negocio, archivos y sesiones presentes. Revisar aplicación y drift de la base del cliente. |
| F05 · Stock negativo | Corregido en camino real; falta integración | Actualización condicional dentro de transacción y CHECK de saldo; probar conexiones reales y reintentos. |
| F06 · Turnos inválidos/solapados | Parcial | Valida médico, paciente, especialidad e intervalos. Bloqueo por médico solo en memoria; pendiente R02. |
| F07 · Zona y fechas | Parcial | Backend interpreta horarios y cortes explícitos; calendario frontend usa Date/localizer del navegador. BirthDate sigue DateTime, pese a README que afirma @db.Date. |
| F08 · Estados de turno | Parcial | DTO enum y tabla de transiciones. Lectura y actualización separadas permiten carreras. |
| F09 · Cobros e ingresos | Parcial | Existe pago y separación PENDING/PAID. KPI por createdAt, carreras pago/anulación y devolución pendiente de definir. |
| F10 · Float/factura vacía | Mayormente resuelto | Decimal y mínimo de ítems. Falta limitar total/subtotales al rango real de Decimal(12,2). |
| F11 · Email vacío | Resuelto en código | Normalización y pruebas pasan. |
| F12 · Rutas inexistentes | Resuelto en código | Agenda y páginas de edición presentes. Falta recorrido visual. |
| F13 · Búsquedas y query | Mayormente resuelto | Búsqueda servidor y límites de página/mes/año. Verificar UX con datos representativos. |
| F14 · Listados sin límites | Parcial | Hay filtros e índices, pero agenda UI pide todo; historias e inventario siguen sin paginación efectiva. |
| F15 · Errores y estados | Mejorado, parcial | Componentes comunes y mapeo Prisma. Estados de fallo parcial de escritura/auditoría no resueltos. |
| F16 · Archivados/especialidades | Mayormente resuelto | Reactivación y protección de especialidades con historial. Protección del último ADMIN usa count y escritura separados; queda carrera. |
| F17 · Dashboard incoherente | Mayormente resuelto | Permisos, categoría de stock y turnos cancelados corregidos. KPI de cobrado necesita R05. |
| F18 · Seed/importación | Mayormente resuelto | Demo separada e idempotente, importador con preview; saldo inicial se carga sin movimiento de apertura conciliable. |
| F19 · Localización Paraguay | Mayormente resuelto | PYG, es-PY, formato de documento/teléfono. No se comprobó moneda histórica ni visualización del calendario fuera de zona. |
| F20 · Edad | Resuelto en código | Helper civil y pruebas; no solo diferencia de años. |
| F21 · PDF | Mejorado en código | Timeout/error de logo, estado, wrapping y salto del total. Falta renderizar y revisar PDF real de varias páginas. |
| F22 · Duplicados/reintentos | Parcial | Claves presentes en UI/API e índices únicos. Falta validar contenido/actor y resolver carreras de replay. |

## Pendientes de cierre, con prioridad

### R01 · Alta · Escritura clínica, auditoría y archivos no son consistentes

Evidencia: `backend/src/medical-records/medical-records.service.ts:80–140`. La historia se crea y luego se guarda su auditoría dentro del mismo try. Si falla únicamente la auditoría, el catch elimina el archivo aunque la historia ya quedó persistida. El usuario recibe error, puede reintentar y duplicar notas; el registro original queda apuntando a un adjunto eliminado. **Reproducido con dobles**, no con fallos inducidos en Supabase.

Resolver historia/metadatos/auditoría en una transacción de base; limitar compensación del objeto al caso en que esa transacción no se confirmó. Definir tratamiento observable de compensaciones fallidas. Cobros y anulaciones también guardan auditoría después de modificar estado, y adendas después de crear la nota: deben quedar atómicos o usar un mecanismo durable equivalente.

### R02 · Alta · Concurrencia de agenda y estados

Evidencia: `backend/src/appointments/appointments.service.ts:48`, `:102`, `:179`, `:237`, `:294` y migraciones. Los Map por médico solo coordinan una instancia. Dos servidores pueden leer disponibilidad y crear ambos turnos. Incluso en una instancia, un paciente puede reservarse simultáneamente con dos médicos porque los locks usan IDs diferentes. No hay restricción de exclusión ni aislamiento serializable/reintento que cierre esa carrera. **Reproducido con dos instancias y un intercalado simulado**.

Implementar integridad en PostgreSQL para los recursos acordados, mediante bloqueo/aislamiento o restricción apropiada, con errores de conflicto entendibles. Aplicar cambios de estado condicionados al estado leído. Usar el mismo criterio para pago/anulación (`invoices.service.ts:351`, `:406`), donde dos operaciones pueden validar PENDING y luego sobrescribirse. Esto no demuestra doble débito bancario: actualmente son registros de estado, pero sí permite inconsistencias administrativas.

### R03 · Alta · Idempotencia no distingue contenido ni usuario

Evidencia: `invoices.service.ts:114–133`, `appointments.service.ts:103–118`, `inventory.service.ts` en replay. La misma clave devuelve una operación existente sin comparar paciente, ítems, producto o actor. **Reproducido en facturas**: pedir paciente B con la clave de una operación de A devuelve la de A. No se afirma que un tercero anónimo pueda obtener claves; el problema es la semántica y el alcance dentro de los permisos existentes.

Definir clave por operación/actor y huella de payload; misma clave y mismo contenido retorna la operación, contenido diferente devuelve 409. Resolver solicitudes simultáneas con la misma clave sin dejar un error único genérico ni repetir efectos. Agregar auditoría a emisión con pago inmediato: ese camino no llama al registro INVOICE_PAY actual.

### R04 · Alta · Permisos clínicos, recuperación y sesión necesitan una decisión de cierre

Evidencia: `medical-records.controller.ts`, `medical-records.service.ts`, `auth.controller.ts`, `frontend/src/services/api.ts`, `authStore.ts` y `login-rate-limit.service.ts`.

La restricción por rol está implementada. Cualquier MEDICO autorizado por ese rol puede consultar cualquier paciente; ADMIN puede leer historias. Acordar si esto representa al equipo asistencial del centro o si hacen falta asignaciones explícitas; implementar la política aprobada y probar acceso a un paciente fuera de alcance cuando corresponda. No imponer como regla universal que cada médico solo pueda ver sus propias notas.

No hay invitación ni recuperación con token de un uso ni MFA, aunque el plan las marca terminadas. Hay cambio con contraseña actual y reset administrativo. Definir un procedimiento mínimo soportado para recuperar acceso y cambio inicial; decidir MFA administrativo antes de abrir acceso público. El JWT ya no se duplica en localStorage, pero la cookie sigue siendo legible por JS; decidir BFF/HttpOnly o documentar el diseño y sus defensas. No se demostró XSS ni bypass JWT por el middleware: la API verifica firma y sesión.

El rate limit es un Map por proceso, sin un límite independiente por IP, y sus entradas de emails distintos no se limpian globalmente. Resolver crecimiento y límites efectivos con despliegue múltiple o capa de entrada. El timeout de 30 minutos es del navegador, no una expiración de inactividad comprobada por API. Logout en UI limpia sesión aunque falle el servidor: debe distinguir cierre local de revocación confirmada.

### R05 · Alta · “Cobrado del mes” usa fecha de emisión

Evidencia: `backend/src/dashboard/dashboard.service.ts:34–55`. Una factura emitida el mes anterior y cobrada hoy queda fuera; el estado PAID no corrige el filtro createdAt. Calcular cobrado por paidAt y emitido por createdAt, definir saldo pendiente a una fecha y cómo se muestran anulaciones/devoluciones. No presentar la anulación de una factura pagada como devolución de dinero efectuada.

### R06 · Media · Archivos: validación y revocación parcialmente implementadas

Hay controles de tamaño y formato útiles, pero magic bytes no acredita ausencia de malware; el nombre CLEAN_MAGIC_VERIFIED no debe interpretarse como análisis antivirus. `MedicalAttachment.isRevoked` no interviene en la lectura: se firman las rutas del array attachments. `StorageService.removeFile` ignora el campo error que Supabase puede retornar sin lanzar excepción.

Usar metadatos/estado como fuente efectiva de autorización de adjuntos, impedir firma de revocados, registrar fallos de limpieza y reintentar. Verificar bucket privado y políticas remotas, y decidir análisis adicional de contenido según tipos y operación. No añadir un “antivirus completo” sin proveedor y necesidad definidos.

### R07 · Media · Límites monetarios, consultas y fechas

Los DTO admiten cantidad 10000, precio 999999999.99 y hasta 100 ítems. Esos productos/sumas pueden exceder Decimal(12,2), aunque cada campo individual pase validación. Limitar subtotal/total y devolver 400 antes de Prisma.

La API acepta filtros de agenda pero `frontend/src/app/dashboard/appointments/page.tsx:24` llama sin rango. Historias e inventario siguen completos. Cerrar límites de consultas y usar rango visible. El calendario usa Date y date-fns local al navegador; probar otra zona e igualar la visualización al centro. Definir representación de fecha civil: el esquema actual conserva DateTime y usa UTC al mediodía, no @db.Date como dice README.

### R08 · Media · Auditoría “inmutable” y sesiones: garantías operativas

AuditLog no tiene endpoints de edición/borrado, pero la migración no impone inmutabilidad con privilegios o restricciones contra el usuario de aplicación. No afirmar protección ante una cuenta de base comprometida. Implementar privilegios adecuados y política de conservación si esa es la garantía exigida. No se detectó una firma criptográfica clínica: “nota firmada” en comentarios no equivale a firma digital implementada.

Además, cambio de password y revocación de sesiones son escrituras separadas; si la segunda falla, la clave cambia pero los tokens previos pueden seguir activos. En reset administrativo la revocación sucede antes de actualizar la cuenta y un login concurrente puede escapar. Probar y resolver atomicidad/coordinación del cambio con emisión de sesiones, y carrera al desactivar/degradar los dos últimos administradores.

### R09 · Media · CI, instalación y documentos no demuestran aún entrega completa

CI existe, pero no ejecuta la suite HTTP, migraciones sobre PostgreSQL ni prueba real de sesiones. No hay prueba automatizada de navegador. Instalar desde cero y probar la ruta de actualización del esquema anterior en un entorno descartable; no usar la base del cliente.

README raíz: pide Node >=20 aunque package.json requiere >=22; usa SUPABASE_KEY/FRONTEND_URL, mientras el código espera SUPABASE_SERVICE_ROLE_KEY/CORS_ORIGINS; afirma @db.Date e inmutabilidad más fuerte que la implementación. Corregir también el plan con checks globalmente marcados y el párrafo antiguo que dice que el e2e solo prueba Hello World. RPO/RTO “acordados” y permisos de publicación requieren confirmación del cliente, no se deducen de un archivo.

## Plan por etapas para terminar

Las etapas son secuenciales por resultado, no nuevos módulos. Estimaciones orientativas de trabajo concentrado, pendientes de acceso a staging y de decisiones del centro.

| Etapa | Trabajo concreto | Criterio de salida | Esfuerzo |
| --- | --- | --- | --- |
| 1. Integridad y fallos | R01, R02, R03, R05 y parte transaccional de R08. Cerrar carreras, replay y cálculo financiero. | PostgreSQL real con conexiones independientes: un solo turno por recurso, una sola transición válida, replay correcto, auditoría atómica y cero adjuntos eliminados tras commit. Cobro de deuda antigua aparece en el mes de pago. | 4–6 días |
| 2. Seguridad y producto acordado | Aprobar política clínica; recuperación mínima de acceso, sesión y límites; R04, R06 y privilegios de R08. Resolver lo necesario para el esquema real de despliegue. | Matriz aprobada por responsable, pruebas negativas por API, adjuntos privados/revocados comprobados, sesión/password coherentes y procedimiento de recuperación probado. | 3–5 días |
| 3. Entrega verificable | R07/R09, documentación fiel, CI con HTTP y PostgreSQL, instalación limpia, integración en staging con Supabase y revisión visual/PDF. | Checkout limpio despliega; migración desde versión previa preserva datos; recorridos ADMIN/MEDICO/RECEPCION en móvil/escritorio y teclado pasan; PDF real revisado; evidencia guardada. | 2–4 días |
| 4. Piloto y cierre | Usuarios reales individuales, inventario inicial conciliado, cuentas históricas saneadas, backup y restauración completa, capacitación y aceptación. | Jornada supervisada completada, incidentes bloqueantes cerrados, restauración medida, responsables/costos/soporte y alcance aceptados por Surmed. | 1–3 días técnicos + agenda del cliente |

Orden de magnitud: **10–18 días de trabajo**, aproximadamente 2–4 semanas según dedicación y disponibilidad. Es una estimación de cierre del alcance actual; no incluye integrar facturación fiscal, WhatsApp, portal, laboratorio, IA ni desarrollar nuevas áreas clínicas. Reestimar al cerrar etapa 1, sin prometer fecha de apertura por adelantado.

## Qué no hace falta rehacer

Conservar Next/Nest/Prisma/PostgreSQL, módulos por dominio, DTO y selects públicos, sesiones persistentes, Decimal, componentes de estado/paginación/modal, imports separados y CI existente. No introducir microservicios, repositorios genéricos para todos los CRUD ni una migración global de frontend para demostrar SOLID.

Desde la mirada de entrevista técnica, las evidencias mejoraron: ya compila y existen pruebas de negocio. El principal punto a cerrar es que algunas garantías están diseñadas para los dobles de tests o para una instancia, con `typeof metodo === 'function'` y fallbacks dentro de servicios productivos. Usar dependencias tipadas reales y construir dobles que respeten esos contratos. Esto mejora responsabilidad única, coherencia y confianza sin reestructurar el proyecto entero.

## Reglas para darlo por terminado

1. Sin R01–R05 abiertos ni inconsistencias transaccionales de R08; restantes riesgos aplicables resueltos o con decisión concreta del centro.
2. Código, pruebas, documentación y entorno desplegado coinciden. “Implementado”, “probado”, “desplegado” y “aceptado” se registran por separado.
3. Backup de base **y** archivos restaurado en aislado; no alcanza con escribir instrucciones o ejecutar un verificador de referencias.
4. Aceptación del dueño y responsable clínico, capacitación y soporte acordados; publicación de datos/marca/Excel solo con autorización real.
5. Funcionalidades nuevas pasan a una propuesta posterior. El proyecto se cierra por alcance aceptado, no por agotarse las ideas de mejora.

Documentos originales: [informe del 04/11](../auditoria-2026-11-04/INFORME.md) y [plan histórico](../auditoria-2026-11-04/PLAN-DE-ACCION.md). Evidencia nueva: [reproducciones](reproducir-pendientes.cjs) y carpeta `evidencia/`.
