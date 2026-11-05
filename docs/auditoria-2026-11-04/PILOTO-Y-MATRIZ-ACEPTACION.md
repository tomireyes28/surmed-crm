# Matriz de Aceptación y Protocolo de Piloto Operativo — Surmed CRM (Fase 5)

Este documento consolida la **Matriz de Aceptación de Fase 5** verificada mediante pruebas automatizadas de extremo a extremo (con el mismo bootstrap real de [`main.ts`](../../backend/src/main.ts) a través de [`setup-app.ts`](../../backend/src/setup-app.ts)) y define el **Protocolo de Jornada Simulada y Piloto Supervisado** previo a la apertura operativa del centro médico.

---

## 1. Matriz de Aceptación Automatizada (Trazabilidad E2E y Suites por Fase)

El bootstrap de aceptación ([`backend/test/app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts)) instancia `AppModule` aplicando `configureApp(app)` (`ValidationPipe` con `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `GlobalExceptionFilter`, cabeceras de seguridad, correlación `X-Request-Id`, CORS y hooks de cierre), verifica mediante `assertDisposableTestDatabaseUrl` que la base de datos esté explícitamente identificada como entorno descartable (`test`), y cierra ordenadamente la aplicación y recursos en `afterAll`.

| Área | Prueba positiva mínima verificada | Prueba negativa / de regresión verificada | Evidencia automatizada |
| :--- | :--- | :--- | :--- |
| **Autenticación** | Provisión de `ADMIN` → alta de `MEDICO` y `RECEPCION` con hash bcrypt → `POST /auth/login` → `GET /auth/me` → `POST /auth/logout` | Clave inválida (`401`), usuario desactivado (`401` y revocación inmediata de sesión), JWT revocado tras logout/cambio de clave (`401`), rate-limit al 6.º intento fallido (`429`) y bloqueo de arranque si falta `JWT_SECRET` | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§1) · [`fase0-security.spec.ts`](../../backend/src/auth/fase0-security.spec.ts) |
| **Autorización** | Cada rol (`ADMIN`, `MEDICO`, `RECEPCION`) opera dentro de su matriz de permisos acordada | `RECEPCION` intenta leer o crear historia clínica (`403` en `GET/POST /medical-records`); `ADMIN` intenta firmar evolución clínica (`403`); `MEDICO` intenta operar inventario o facturación (`403`); `GET /dashboard-stats/kpis` oculta montos financieros (`null`) a roles no administradores; `GET /patients/:id` nunca incluye `medicalRecords` | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§2, §3) · [`fase0-security.spec.ts`](../../backend/src/auth/fase0-security.spec.ts) |
| **Paciente** | Alta de múltiples pacientes sin email (`""` normalizado a `null`), edición (`PATCH /patients/:id`), búsqueda paginada en servidor (`GET /patients?search=...`), archivo lógico (`DELETE /patients/:id`) y reactivación (`PATCH /patients/:id/reactivate`) | Documento duplicado (`409`), fecha de nacimiento futura o inválida (`400`), paciente inexistente (`404`), query de paginación malformada (`?page=10abc` → `400`), preselección de paciente fuera de la primera página al emitir comprobante | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§3) · [`fase1-reproducibility.spec.ts`](../../backend/src/fase1-reproducibility.spec.ts) · [`fase4-polish-maintainability.spec.ts`](../../backend/src/fase4-polish-maintainability.spec.ts) |
| **Historia / archivo** | `MEDICO` registra evolución clínica con adjunto PDF válido (`%PDF-`, SHA-256), registra adenda inmutable (`POST /medical-records/:id/addendum`) y obtiene URL firmada temporal (15 min) | Archivo falso con extensión `.pdf` y firma binaria ejecutable `MZ` (`400`), exceso de tamaño (`> 10 MB`), compensación automática (`removeFile`) ante fallo de base de datos para evitar huérfanos en Storage, tolerancia a adjunto faltante (`missingAttachmentsCount`), trazabilidad en `AuditLog` sin filtrar notas clínicas | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§4) · [`fase3-files-audit-continuity.spec.ts`](../../backend/src/fase3-files-audit-continuity.spec.ts) |
| **Turnos** | Alta de turno en zona `America/Asuncion` (`-03:00`), transiciones válidas (`PENDING → CONFIRMED → ATTENDED`) y cancelación con motivo | Superposición de horario para médico o paciente (`409`), especialidad no atendida por el médico (`400`), usuario sin rol `MEDICO` (`400`), transición inválida desde estado terminal (`ATTENDED → PENDING` → `409`), reintento idempotente con `Idempotency-Key` | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§5) · [`fase2-business-integrity.spec.ts`](../../backend/src/fase2-business-integrity.spec.ts) |
| **Inventario** | Creación de insumo → entrada (`IN`) → salida (`OUT`) → reconciliación exacta de saldo | Dos salidas simultáneas sobre saldo limitado (`1` éxito `201` y `1` rechazo `400`), reintento con misma `Idempotency-Key` sin duplicar movimiento, intento de alterar `quantity` por `PATCH /inventory/products/:id` (`400`), movimiento sobre producto desactivado (`400`) | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§6) · [`fase2-business-integrity.spec.ts`](../../backend/src/fase2-business-integrity.spec.ts) |
| **Cobros** | Emisión en estado `PENDING` → registro de pago (`PATCH /invoices/:id/pay`) → impacto en KPI `monthlyRevenue` (`Cobrado`) separado de `monthlyPending` (`Pendiente`) | Factura sin ítems (`400`), precio negativo (`400`), repetición idempotente de emisión, doble cobro (`409`), anulación con motivo (`PATCH /invoices/:id/cancel`) e intento de cobro sobre comprobante anulado (`409`) | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§7) · [`fase2-business-integrity.spec.ts`](../../backend/src/fase2-business-integrity.spec.ts) |
| **Entrega** | Checkout limpio → validación de variables → migraciones Prisma → build de `backend` y `frontend` → sondas `/health` y `/health/ready` | Falla de base en `/health/ready` (`503`), guardia `assertDisposableTestDatabaseUrl` contra bases no identificadas como `test`, verificación de integridad post-restauración (`npm run verify:backup`) | [`app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) (§0) · [`fase1-reproducibility.spec.ts`](../../backend/src/fase1-reproducibility.spec.ts) · [`fase3-files-audit-continuity.spec.ts`](../../backend/src/fase3-files-audit-continuity.spec.ts) |

### Comandos de ejecución de la matriz

```bash
# Desde backend/
npm run lint:check
npm run typecheck
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build

# Desde frontend/
npm run lint
npm run typecheck
npm run build
```

---

## 2. Protocolo de Piloto Operativo

El piloto se divide en dos etapas secuenciales obligatorias:
1. **Etapa A — Jornada Simulada (Datos sintéticos, duración: 90 minutos):** Un operador de `RECEPCION`, un profesional `MEDICO` y el responsable `ADMIN` ejecutan el recorrido completo de una jornada clínica sin pacientes reales.
2. **Etapa B — Operación Supervisada (Alcance acotado, primeros 3 días hábiles):** Operación con un consultorio y una especialidad bajo supervisión presencial/remota inmediata, conciliando caja e inventario al cierre de cada turno.

### 2.1 Guion de Jornada Simulada por Rol (Etapa A)

| Paso | Rol Ejecutor | Acción en Surmed CRM | Resultado Esperado de Aceptación | Estado (`OK` / `OBS`) |
| :---: | :--- | :--- | :--- | :---: |
| **1** | `ADMIN` | Ingresar a `/dashboard/specialties` y `/dashboard/staff`; crear especialidad y dar de alta a 1 `MEDICO` y 1 `RECEPCION` con contraseña temporal (`>= 8` caracteres). | Usuarios creados; el listado no expone hashes de contraseña. | `[ ]` |
| **2** | `RECEPCION` | Iniciar sesión, cambiar contraseña inicial (`PATCH /auth/change-password`) y volver a ingresar. Registrar 2 pacientes en `/dashboard/patients/new` (uno sin email y con teléfono `+595...`). | Ambos pacientes se crean sin error `409` por email vacío; la edad civil se calcula sin desfase de zona horaria. | `[ ]` |
| **3** | `RECEPCION` | Intentar acceder manualmente a la pestaña de Historia Clínica o invocar lectura clínica. | La interfaz no ofrece acceso clínico a `RECEPCION` y el backend rechaza cualquier acceso con `403 Forbidden`. | `[ ]` |
| **4** | `RECEPCION` | En `/dashboard/appointments`, agendar un turno para hoy con el médico activo, y probar agendar otro turno superpuesto en el mismo horario. | El primer turno se crea en hora de Asunción (`-03:00`); el turno superpuesto es rechazado con mensaje claro (`409`). | `[ ]` |
| **5** | `RECEPCION` | Cambiar el estado del turno de `Pendiente` → `Confirmado` → `En Sala de Espera`. | El cambio se refleja en la agenda del día. | `[ ]` |
| **6** | `MEDICO` | Iniciar sesión, abrir la ficha del paciente desde su turno, registrar una evolución clínica adjuntando un estudio en `.pdf` (`<= 10 MB`). | Evolución guardada; el adjunto abre mediante enlace firmado temporal; el botón de envío previene doble clic. | `[ ]` |
| **7** | `MEDICO` | Agregar una **Adenda / Aclaración** sobre la evolución recién firmada y marcar el turno como `Atendido`. | La evolución original permanece intacta y la adenda queda vinculada con fecha y motivo; el turno pasa a `Atendido` (bloqueando retrocesos). | `[ ]` |
| **8** | `RECEPCION` | En `/dashboard/inventory`, registrar el consumo (`OUT`) de un insumo médico utilizado en la consulta. | El stock disminuye exactamente en la cantidad indicada; si supera el saldo disponible, el sistema rechaza la operación. | `[ ]` |
| **9** | `RECEPCION` | En `/dashboard/billing/new`, buscar al paciente, emitir un comprobante interno en `PYG` (primero como `Pendiente` y luego registrar el cobro con el botón `Cobrar`), y descargar el PDF. | El comprobante pasa de `PENDING` a `PAID`; el PDF muestra montos en `Gs.`, aviso de documento interno no fiscal (SIFEN/DNIT) y conserva todas las filas. | `[ ]` |
| **10** | `ADMIN` | Verificar `/dashboard` (tarjetas `Cobrado en el Mes` vs `Pendiente de Cobro`), anular un comprobante de prueba con motivo y revisar `GET /audit-logs`. | El comprobante anulado muestra sello `ANULADO` en el PDF y se descuenta de las métricas; `AuditLog` registra creación/lectura clínica y cobro/anulación con actor y timestamp. | `[ ]` |

---

## 3. Registro de Formación, Responsables e Incidencias del Piloto

### 3.1 Matriz de Responsables y Formación Previa

| Rol Operativo | Nombre y Apellido | Formación Completada | Responsabilidades Clave en el Piloto | Firma / Fecha |
| :--- | :--- | :---: | :--- | :--- |
| **Dirección / Admin (`ADMIN`)** | *Asignar al inicio del piloto* | `[ ]` | Gestión de usuarios/roles, conciliación diaria de caja (`Cobrado` vs `Pendiente`), revisión de bitácora de auditoría y custodia de backups. | |
| **Recepción (`RECEPCION`)** | *Asignar al inicio del piloto* | `[ ]` | Padrón de pacientes, gestión de agenda/turnos, movimientos de insumos de recepción y emisión/cobro de comprobantes internos. | |
| **Profesional Médico (`MEDICO`)** | *Asignar al inicio del piloto* | `[ ]` | Atención de agenda propia, registro de evoluciones clínicas, carga de estudios adjuntos (`.pdf`/`.jpg`/`.png`/`.webp`) y adendas. | |
| **Soporte Técnico / Operación** | *Asignar al inicio del piloto* | `[ ]` | Monitoreo de `/health/ready`, ejecución de copias de seguridad, verificación `npm run verify:backup` y atención de incidencias. | |

### 3.2 Planilla de Registro de Incidencias durante el Piloto

| ID | Fecha y Hora (`-03:00`) | Rol / Usuario | Módulo (`Turnos`, `HC`, `Stock`, `Caja`) | Descripción del Comportamiento Observado | `X-Request-Id` (si aplica) | Severidad (`S0`–`S3`) | Acción Tomada / Responsable | Estado |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| `INC-01` | *Ej. 2026-11-06 09:15* | *Recepción* | *Simulación inicial* | *Sin incidencias abiertas al cierre de Fase 5* | `N/A` | `-` | `-` | `CERRADO` |

---

## 4. Criterios de Detención Inmediata del Piloto (*Stop-the-Line*)

Se debe **detener inmediatamente la ampliación del piloto** y activar el procedimiento de contención de [`OPERACION-Y-CONTINUIDAD.md`](./OPERACION-Y-CONTINUIDAD.md) ante cualquiera de los siguientes eventos críticos (`S0`):

1. **Exposición de datos clínicos o personales no autorizada:**
   - Un usuario con rol `RECEPCION` o sin sesión logra visualizar evoluciones médicas, adendas o adjuntos del bucket privado, o un usuario no `ADMIN` visualiza métricas de facturación global.
2. **Pérdida o alteración de registros clínicos firmados:**
   - Una evolución clínica o adenda desaparece, se sobrescribe sin rastro de adenda o pierde su vínculo con el paciente/médico autor.
3. **Inconsistencia de stock o de caja:**
   - El saldo de un producto queda negativo (`quantity < 0`), un movimiento de stock no concilia con la suma de ingresos/egresos (`npm run verify:backup`), o un comprobante `PENDING` o `CANCELLED` se contabiliza dentro del monto `Cobrado` (`monthlyRevenue`).

### Protocolo ante activación de *Stop-the-Line*
1. Congelar altas nuevas en el módulo afectado y preservar el `X-Request-Id` y la hora exacta del evento.
2. Ejecutar `npm run verify:backup` (en `backend/`) para diagnosticar la integridad referencial y contable sin exponer PII.
3. Aplicar la corrección, incorporar el caso como prueba de regresión obligatoria en [`backend/test/app.e2e-spec.ts`](../../backend/test/app.e2e-spec.ts) y repetir la **Jornada Simulada (Sección 2.1)** antes de reanudar el piloto.
