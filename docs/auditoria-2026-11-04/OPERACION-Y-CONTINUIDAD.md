# Procedimiento Operativo, Archivos Clínicos, Backups y Continuidad (Fase 3 · T11, T12 y T13)

Fecha de actualización: 9 de noviembre de 2026. Recuperación técnica con datos sintéticos verificada: [etapa 4](../auditoria-2026-11-09/ETAPA-4-PREPARACION.md). El entorno del cliente todavía no está desplegado ni aceptado; piloto diferido. La contingencia y los objetivos operativos requieren validación del establecimiento.

---

## 1. Política de Archivos Clínicos y Privacidad de Storage (`T11` / `S07`)

### Controles en el Backend (`StorageService` y `MedicalRecordsController`)
1. **Límites multipart estrictos:**
   - Tamaño máximo por archivo: **10 MB** (`10.485.760` bytes).
   - Máximo **1 archivo** y **10 campos** por petición en `POST /medical-records`.
2. **Validación de contenido binario real (Magic Bytes):**
   - Solo se admiten:
     - `application/pdf` (`.pdf`, firma `%PDF-`)
     - `image/jpeg` (`.jpg` / `.jpeg`, firma `FF D8 FF`)
     - `image/png` (`.png`, firma `89 50 4E 47 0D 0A 1A 0A`)
     - `image/webp` (`.webp`, firma `RIFF....WEBP`)
   - Cualquier archivo cuyo contenido binario no coincida con su extensión/MIME declarado se rechaza con `400 Bad Request` antes de contactar a Supabase Storage.
3. **Metadatos verificados y compensación automática:**
   - Cada adjunto se almacena bajo una ruta generada con UUID (`<patientId>/<uuid>.<ext>`) y registra en `medical_attachments` su tamaño, `mimeType`, `sha256`, autor (`uploadedById`), paciente y estado de verificación (`CLEAN_MAGIC_VERIFIED`).
   - Evolución, metadatos y auditoría se confirman juntos. Ante fallo se comprueba primero si el commit quedó confirmado antes de eliminar el objeto. Si no se puede confirmar ni compensar, se conserva para conciliación y se registra el fallo.
   - `CLEAN_MAGIC_VERIFIED` describe validación de formato; no es análisis antivirus.
4. **Descarga autorizada y configuración del Bucket:**
   - El bucket `medical-records` en Supabase debe estar configurado como **`public: false` (Privado)**.
   - La web descarga por `/api/backend/medical-records/attachments/:id/content`. La API verifica sesión, rol MEDICO, asignación o turno propio y estado no revocado en cada solicitud. ADMIN gestiona accesos sin leer historias. El backend comprueba que el bucket sea privado; deben verificarse también las políticas remotas contra accesos ajenos a la aplicación.
   - Las URLs firmadas de la versión anterior siguen válidas hasta su vencimiento original. Una descarga ya iniciada o copia local no se puede revocar remotamente.

---

## 2. Auditoría Clínica, Adendas e Inmutabilidad (`T12` / `S08`)

1. **Correcciones sin sobrescritura por API:**
   - Las evoluciones clínicas (`MedicalRecord`) no poseen endpoint de edición (`PATCH`) ni borrado (`DELETE`).
   - Toda corrección o ampliación posterior se registra como una **adenda** vinculada (`parentRecordId`) mediante `POST /medical-records/:id/addendum`, conservando autor, fecha/hora y el texto original intacto.
2. **Registro de auditoría (`audit_logs`):**
   - Se registran automáticamente con `actorId`, `actorRole`, `action`, `resource`, `resourceId`, `patientId`, `reason` y `createdAt`:
     - `MEDICAL_RECORD_READ` (consulta de historia clínica de un paciente)
     - `MEDICAL_RECORD_CREATE` (alta de evolución clínica y hash SHA-256 de adjunto)
     - `MEDICAL_RECORD_ADDENDUM` (registro de adenda aclaratoria)
     - `INVOICE_PAY` (registro de cobro de comprobante)
     - `INVOICE_CANCEL` (anulación de comprobante con motivo)
   - El endpoint `GET /audit-logs` está restringido a `ADMIN` y no expone operaciones de modificación ni borrado.
   - No hay firma digital ni inmutabilidad frente a administradores/credenciales privilegiadas de PostgreSQL. Configurar privilegios mínimos y conservación en el despliegue; no usar el rol migrador como rol ordinario sin evaluar sus permisos.
   - Asignaciones, recuperación y lectura/revocación de adjuntos generan sus eventos de auditoría; no contienen el token de recuperación en claro.
3. **Redacción en logs y observabilidad:**
   - [`redactSensitiveData`](../../backend/src/common/logger/structured-logger.ts) redacta `password`, `token`, `authorization`, `notes` y secretos antes de cualquier log o metadato.
   - `GET /health` reporta liveness y `GET /health/ready` verifica conectividad real con PostgreSQL (`SELECT 1`), devolviendo `503 Service Unavailable` ante caídas de base de datos.

---

## 3. Backups, Restauración Aislada y Conciliación (`T13`)

### Parámetros operativos de recuperación (RPO / RTO)
Los siguientes valores son objetivos propuestos pendientes de aprobación por Surmed y de medición mediante un simulacro real. El verificador de referencias no sustituye restaurar base y archivos.

| Parámetro | Objetivo propuesto, no medido | Mecanismo |
| :--- | :--- | :--- |
| **RPO (Pérdida máxima tolerable de datos)** | **<= 24 horas**, pendiente de acuerdo. PITR puede mejorar el punto SQL, pero no recupera por sí solo archivos Storage. | Programar respaldo completo y custodia externa; todavía no configurado en producción. |
| **RTO (Tiempo objetivo de recuperación)** | **<= 2 horas**, pendiente de medición productiva | Recuperar base y bytes, permisos, secretos, infraestructura y aplicación; validar antes de reabrir. |

### Procedimiento de respaldo (PostgreSQL + Storage)
1. Detener todas las instancias/escritores y usar la sesión de operaciones con conexión migradora separada, credenciales Storage y clave de cifrado. El runtime limitado no puede exportar el historial de migraciones. Ejecutar `npm run backup:create` con las variables de la [receta vigente](../../deploy/README.md).
2. Copiar backup cifrado fuera del host/proyecto y custodiar la clave por separado. Un dump SQL no conserva los bytes de adjuntos; el comando exporta ambos. Sin manifiesto autenticado al final la copia está incompleta.
3. Restaurar con `npm run backup:restore-test` únicamente en base local vacía y bucket privado temporal nuevo. Se autentican entradas, comparan todas las filas y hashes de archivos y reponen grants limitados. Producción remota requiere procedimiento revisado en entorno nuevo, nunca limpiar la base activa.
4. `npm run backup:verify` concilia referencias y objetos, incluidos revocados, con paginación completa y error si falla Storage. No equivale a restaurar. El simulacro completo ya pasó con datos sintéticos; repetir con volumen/infraestructura del centro antes de operación real.

---

## 4. Contingencia Manual ante Corte de Internet o Energía (`T13`)

Si el establecimiento sufre una interrupción eléctrica o de conectividad a Internet durante el horario de atención:

1. **Recepción (Agenda y Admisión):**
   - Utilizar la planilla física de contingencia foliada del día (o exportación matutina de agenda).
   - Registrar de forma manuscrita: hora de llegada, nombre completo, número de documento, profesional asignado y comprobante provisorio numerado en caso de cobro en efectivo.
2. **Consultorio Médico (Evoluciones Clínicas):**
   - Registrar la evolución en ficha clínica física de contingencia firmada y sellada por el médico tratante, consignando fecha, hora, paciente (nombre y documento) y diagnóstico/indicaciones.
   - Custodiar las fichas físicas en carpeta cerrada bajo llave en dirección médica hasta el restablecimiento del servicio.
3. **Carga posterior y conciliación al restablecer el sistema:**
   - **Paso 1:** Recepción verifica pacientes nuevos y registra los turnos atendidos y los comprobantes emitidos durante el corte, verificando que el total de caja coincida con los comprobantes provisorios.
   - **Paso 2:** Cada médico transcribe su evolución clínica en el sistema (adjuntando foto/escaneo PDF de la ficha física firmada y dejando constancia de «Transcripción por contingencia operativa del [fecha/hora]»).

---

## 5. Titularidad de Cuentas, Responsables y Salida de Datos (`T13`)

- **Titularidad de servicios:** Las cuentas de base de datos PostgreSQL, Supabase Storage, dominio y hosting deben estar registradas a nombre institucional de **Surmed** (correo corporativo de dirección/administración del centro), con autenticación multifactor (MFA) activa. El desarrollador opera con permisos delegados revocables, nunca como único propietario.
- **Separación de accesos:** Las claves `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` residen únicamente en las variables de entorno del servidor backend, nunca en el frontend ni en repositorios Git.
- **Exportación / Salida de datos:** Ante cambio de proveedor o cierre de contrato, Surmed puede exportar el 100 % de su base relacional en formato estándar PostgreSQL (`pg_dump`) y descargar la totalidad del bucket `medical-records` conservando la estructura `<patientId>/<archivo>` y la tabla `medical_attachments` para trazabilidad íntegra.
