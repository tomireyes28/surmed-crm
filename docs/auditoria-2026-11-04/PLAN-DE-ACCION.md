# Plan de acción para Surmed

Fecha: 4 de noviembre de 2026. Basado en [la auditoría del código actual](INFORME.md). Estado inicial: tareas propuestas, ninguna corrección de aplicación implementada en esta revisión.

## Objetivo y orden

Entregar el alcance contratado con seguridad, integridad de datos y un proceso de operación verificable. Después ofrecer ampliaciones que reduzcan costos o mejoren la atención. Conservar Next, Nest, Prisma/PostgreSQL y el monolito modular.

P0 significa exposición crítica que debe cerrarse primero. P1 identifica bloqueantes de salida o riesgos altos. P2 identifica correcciones y pulido que deben planificarse por impacto. Las mejoras nuevas se presupuestan aparte del saneamiento del alcance existente.

Las referencias Sxx y Fxx corresponden al informe. Las estimaciones son días de trabajo concentrado de una persona familiarizada con el repositorio; incluyen pruebas relevantes, pero no demoras del cliente, validación legal/fiscal, compra de servicios ni integraciones nuevas. Reestimar después de las primeras dos fases. No constituyen una fecha comprometida de apertura.

| Fase | Resultado | Esfuerzo orientativo | Dependencias |
| --- | --- | --- | --- |
| 0 | Accesos y credenciales protegidos | 3–5 días | Confirmar exposición actual del sistema y matriz de permisos |
| 1 | Proyecto compilable y despliegue reproducible | 3–5 días | Ninguna técnica; ejecutar inmediatamente después de contener P0 |
| 2 | Reglas de negocio y datos consistentes | 5–8 días | Contratos y base descartable de fase 1 |
| 3 | Archivos, trazabilidad y operación segura | 4–6 días | Permisos y sesión definidos |
| 4 | Pulido de UI y mantenibilidad | 3–5 días | Contratos estables |
| 5 | Aceptación y piloto supervisado | 3–5 días | Fases anteriores y disponibilidad de personal |

Total base: **21–34 días**. Con margen de integración y ajustes del 20 %, aproximadamente **25–41 días de trabajo**, alrededor de 5–8 semanas a dedicación completa. Si Surmed necesita abrir antes, reducir el alcance del piloto con el cliente y bloquear módulos todavía inseguros; las condiciones de seguridad de datos reales deben seguir cumplidas.

## Fase 0 — Contener exposición y cerrar accesos

### T01 · P0 · Aprovisionamiento y credenciales · S01, S02, S04

- [x] Retirar `GET /auth/seed`; reemplazarlo por comando operativo sin contraseña fija.
- [x] Hash centralizado para alta/cambio de contraseña y demo; eliminar passwords por defecto.
- [x] Definir invitación, cambio inicial y restablecimiento con tokens de un solo uso y vencimiento.
- [x] Resolver cuentas existentes inseguras mediante un procedimiento controlado; no volcar passwords a logs.
- [x] Respuestas públicas de usuario mediante selección explícita; aplicar también a relaciones en turnos y al desactivar/editar.
- [x] Si ya hubo exposición, cambiar credenciales y revocar sesiones afectadas, revisando accesos disponibles.

**Aceptación:** `/auth/seed` devuelve 404; una cuenta creada por ADMIN inicia sesión con la clave definida; la base guarda hash; ningún endpoint de la API devuelve `password`. Desactivar un usuario bloquea inmediatamente sus siguientes peticiones. Los tests cubren creación, modificación, errores y respuestas relacionadas.

### T02 · P0 · Autorización clínica y administrativa · S03, S08

- [x] Aprobar una matriz por operación y contexto, diferenciando ADMIN administrativo de profesional clínico.
- [x] Aplicar permisos en servidor a historias, ficha de paciente, archivos, agenda y métricas.
- [x] Retirar historias del DTO/respuesta de ficha administrativa.
- [x] No solicitar datos clínicos desde una pantalla sin permiso; conservar la defensa del servidor.
- [x] Autorizar por paciente y relación asistencial conforme a la política del centro; documentar acceso excepcional.

**Aceptación:** con sesión de RECEPCION, consultar o crear historias devuelve 403 y consultar ficha administrativa no contiene notas ni adjuntos clínicos. Un rol médico no recibe ingresos ni inventario si la política los restringe. Acceder a otro paciente fuera del alcance permitido falla aunque se conozca su UUID. Se prueban todos los caminos alternativos, no solo el endpoint principal.

### T03 · P1 · Configuración, sesión y login · S06, S08

- [x] Configuración validada: JWT_SECRET obligatorio y fuerte, DATABASE_URL, Supabase, orígenes, PORT y ambiente.
- [x] Firma JWT configurada después de cargar configuración; sin clave de respaldo conocida.
- [x] Decidir sesión HttpOnly/BFF o alternativa justificada; evitar persistir el mismo secreto en dos lugares.
- [x] Definir caducidad, inactividad, revocación, logout, recuperación y respuesta global a 401.
- [x] Limitar intentos de login y recuperación; MFA para cuentas administrativas.
- [x] Revisar cookies, CSRF si corresponde, CORS y caché de respuestas sensibles.

**Aceptación:** sin secreto el servidor falla al arrancar con un mensaje sin datos sensibles; expirar o cerrar sesión produce un estado coherente sin bucles de redirección. Una cookie inventada no concede acceso a datos. Logout/revocación y rate limiting se verifican en un entorno de prueba.

## Fase 1 — Reproducibilidad y contratos

### T04 · P1 · Compilación y consumidores de API · F01, F02

- [x] Definir tipos de especialidad y actualizar los tres imports rotos.
- [x] Corregir el consumo de `PaginatedPatients` en nueva factura y nuevo turno.
- [x] Crear búsqueda de pacientes paginada para selects; soportar preselección por ID fuera de la página actual.
- [x] Incorporar verificación de tipos y contratos en CI.

**Aceptación:** build y typecheck del frontend pasan; con más de diez pacientes se puede agendar y facturar a cualquiera, incluso abriendo el modal desde su ficha. Una respuesta paginada no provoca `.map is not a function`. No se resuelve con un cast ni con un límite enorme de registros.

### T05 · P1 · Base y paquete de producción · F03, F04, F18

- [x] Agregar migraciones hacia adelante para el esquema actual; no reescribir migraciones aplicadas del cliente.
- [x] Corregir el layout del build/entrypoint productivo.
- [x] Separar seed demo, primer administrador e importación de inventario.
- [x] Importación comercial con preview, validación, idempotencia y reporte; no mezclar datos de demo.
- [x] Entregar `.env.example`, versiones de Node, scripts y guía de instalación desde un checkout limpio.
- [x] Revisar clientes Prisma generados duplicados y garantizar `prisma generate` en el proceso de entrega.

**Aceptación:** instalación con `npm ci`, generación, migraciones y build funciona desde cero en entorno descartable; también se prueba actualizar una versión anterior conservando sus datos. El comando de producción levanta el backend real y su health check responde. Dos importaciones del mismo archivo no duplican productos. Nunca se usa `migrate reset` sobre la base del cliente.

### T06 · P1 · Dependencias y controles automáticos · alertas npm

- [x] Clasificar cada alerta por cadena de dependencia, entorno y funcionalidad usada.
- [x] Actualizar Next y su configuración ESLint en versiones compatibles; Multer y dependencias de Express; restantes paquetes prioritarios.
- [x] Aislar/remediar `xlsx` en el importador. Revisar Prisma/herramientas sin degradar versiones a ciegas.
- [x] Fijar políticas de lockfile, actualización y revisión de avisos; evitar comodín `*` sin justificación.
- [x] CI: lint sin escritura, typecheck, builds, pruebas de dominio e integración y auditoría de dependencias.

**Aceptación:** ninguna alerta crítica/alta aplicable queda sin remediación o mitigación documentada y revisada. Las alertas de herramientas y código no usado se distinguen de exposición productiva. Un fallo de build o test impide desplegar. La auditoría vuelve a consultarse al implementar; las versiones propuestas el 04/11/2026 no son una recomendación permanente.

## Fase 2 — Integridad del negocio

### T07 · P1 · Validación y respuestas · S05, F08, F10, F11, F13, F15

- [x] Clases concretas para todos los PATCH y DTO de query; campos editables mapeados explícitamente.
- [x] Límites razonables de tamaño, cantidad, página, duración y montos; validar UUID/enum/fechas según contrato.
- [x] Normalización de email opcional, espacios, nombres y documento; altas/ediciones coherentes.
- [x] Mapeo de errores de Prisma y respuestas 400/404/409 estables; sin datos de infraestructura.
- [x] DTO de salida con relaciones mínimas; publicar contrato OpenAPI usable para generar tipos del frontend.

**Aceptación:** PATCH de producto rechaza `quantity` y relaciones no editables; enviar cantidades negativas/decimales inválidas o roles desconocidos devuelve 400 sin cambios. Alta sin email funciona; vacío y null se manejan según el contrato. Recursos inexistentes y conflictos no terminan en un 500 genérico. Factura sin ítems se rechaza.

### T08 · P1 · Stock concurrente y trazable · F05, F16, F22

- [x] Salida atómica condicionada a saldo y estado activo; movimiento y saldo en una misma transacción.
- [x] Restricciones de base que impidan saldo inválido; recuperación/reintento según aislamiento elegido.
- [x] Clave de idempotencia para movimientos relevantes y política de ajustes/compensaciones.
- [x] Saldos iniciales/importación representados de modo que pueda reconciliarse stock con movimientos.

**Aceptación:** en PostgreSQL descartable con saldo 5 y dos salidas simultáneas de 4, exactamente una se acepta, saldo final 1 y un solo movimiento efectivo. Repetir una petición con igual clave no descuenta otra vez. Un fallo del movimiento no altera stock y viceversa. No se puede consumir un producto desactivado mediante su ID.

### T09 · P1 · Agenda, contexto y zona horaria · F06, F07, F08

- [x] Validar médico activo, rol, especialidad, paciente y disponibilidad.
- [x] Detectar solapamiento por intervalos y preservar esa regla con reservas concurrentes.
- [x] Política de estados, cancelación, ausencia y reprogramación; registrar actor/motivo cuando corresponda.
- [x] Rango visible/médico como filtro de consulta; preparar consultorios si son recursos limitantes reales.
- [x] Configurar `America/Asuncion`; aceptar instantes con offset y mostrar según zona del centro.

**Aceptación:** dos reservas concurrentes superpuestas del mismo recurso no se confirman ambas. Otro médico o intervalo contiguo válido sí funciona. No se asigna una especialidad ajena ni un usuario de recepción como médico. El mismo turno conserva su hora del centro con servidor en UTC y navegador en otra zona. Una transición prohibida devuelve conflicto y conserva el estado anterior.

### T10 · P1 · Importes y flujo de cobro · F09, F10, F19, F22

- [x] Acordar si Invoice representa deuda, comprobante interno o documento fiscal; separar registro de pago.
- [x] Definir PYG y precisión; migrar Float a Decimal o representación entera apropiada con conciliación previa.
- [x] Pagos, saldos y anulaciones con actor, motivo y reglas; decidir pagos parciales según necesidad.
- [x] KPIs separados de emitido/cobrado/pendiente, con permisos correctos.
- [x] Idempotencia para emisión/cobro y protección de totales del lado servidor.

**Aceptación:** emitir una deuda no aumenta «cobrado»; un pago válido sí y solo una vez. Los totales se conservan exactamente y se calculan en servidor. Anulación no equivale silenciosamente a devolución de dinero. Las cantidades existentes no se convierten de moneda por suposición. La integración fiscal es un proyecto adicional si no estaba contratada.

## Fase 3 — Archivos, registro y continuidad

### T11 · P1 · Archivos clínicos · S07

- [x] Límites multipart, validación de contenido y tipos, autorización previa y compensación de subida.
- [x] Verificar bucket privado, permisos remotos y acceso temporal tras autorización.
- [x] Metadatos del archivo: tamaño, hash, tipo, autor, paciente, estado de análisis y objeto de almacenamiento.
- [x] Definir caducidad, revocación, limpieza de huérfanos y política de conservación.

**Aceptación:** un archivo excesivo o de tipo no permitido se rechaza con 4xx sin agotar el proceso. Un usuario sin permiso no obtiene URLs. Si la historia falla, el archivo no queda accesible ni huérfano indefinidamente. El bucket no publica objetos por URL anónima. Se prueba la expiración y el comportamiento ante un adjunto faltante.

### T12 · P1 · Auditoría clínica y observabilidad · S08, F15

- [x] Registrar acceso/descarga/creación clínica y acciones administrativas sensibles con actor, recurso, fecha y motivo cuando aplique.
- [x] Mantener autoría, versiones y correcciones por adenda; no sobrescribir silenciosamente contenido clínico firmado.
- [x] Logs estructurados, errores y alertas con redacción de datos sensibles.
- [x] Health/readiness, manejo de shutdown, pool de conexiones, límites y configuración de despliegue.

**Aceptación:** puede reconstruirse quién accedió a una historia y quién anuló un comprobante; los usuarios ordinarios no pueden borrar la auditoría. Los logs no contienen notas clínicas, tokens ni contraseñas. Caída de base o almacenamiento genera señal operativa y mensaje correcto en UI, sin confundirse con «sin pacientes».

### T13 · P1 · Backups y procedimiento operativo

- [x] Acordar pérdida tolerable de datos (RPO) y tiempo de recuperación (RTO) con el dueño.
- [x] Copias de PostgreSQL y objetos de Storage, retención, cifrado y separación de accesos.
- [x] Restauración en ambiente aislado y conciliación de registros con archivos.
- [x] Procedimiento ante corte de Internet/sistema: continuidad manual mínima, resguardo y carga posterior con conciliación.
- [x] Responsables de cuentas/proveedores, soporte, incidentes, costos y salida/exportación de datos.

**Aceptación:** restauración completa demostrada y medida; resultados aceptados por Surmed. Cuenta del centro como propietaria de servicios o transferencia documentada. Credenciales y backups no dependen únicamente de la computadora del desarrollador.

## Fase 4 — Pulido y mantenibilidad

### T14 · P2 · Navegación y experiencia · F12–F17, F19–F21

- [x] Reparar enlaces a agenda y páginas de edición faltantes; recorrer todos los botones y rutas.
- [x] Búsqueda de servidor, filtros por año, paginación estable y política de archivado/reactivación.
- [x] Distinguir error, vacío y carga; reintento; mensajes de validación claros junto al campo.
- [x] Labels vinculados a inputs, nombres accesibles para botones de icono, foco visible y errores anunciables.
- [x] Modales con rol/nombre, foco inicial y retorno, navegación con Tab y cierre por Escape cuando sea seguro; proteger cambios sin guardar.
- [x] Revisar móvil y escritorio, tablas anchas y acciones que hoy dependen de hover.
- [x] Configurar es-PY, PYG, +595, documento/cédula; edad civil correcta.
- [x] PDF con errores de imagen, saltos de página, textos largos, moneda y estado de anulación.

**Aceptación:** recorrido con teclado y a anchos de 360, 768 y 1440 px sin pérdida de funciones; botones comprensibles sin hover. No hay enlaces visibles a 404. Búsqueda encuentra pacientes de otras páginas. PDF de múltiples páginas conserva filas y total; si falla el logo se informa o continúa según diseño.

### T15 · P2 · Refactor y presentación técnica

- [x] Extraer reglas repetidas de permisos/estados/stock/fecha/moneda; componentes para formularios, estados y paginación.
- [x] Separar carga de datos y presentación en páginas complejas sin generar abstracciones genéricas innecesarias.
- [x] Endurecer TypeScript y retirar código muerto/generado obsoleto; comentarios de decisiones en lugar de comentarios de edición.
- [x] README propio, arquitectura, decisiones, instalación, pruebas, despliegue, backups y alcance conocido.
- [x] Demo exclusivamente sintética; confirmar permiso para publicar marca, fuentes, Excel y capturas.

**Aceptación:** reglas centrales tienen una única implementación o contrato estable, cada extracción tiene una responsabilidad concreta y las pruebas de negocio siguen pasando. Una persona nueva puede levantar y comprender la demo siguiendo la documentación sin pedir secretos del cliente.

## Fase 5 — Matriz de aceptación y piloto

No reutilizar las reproducciones de la auditoría como tests que perpetúen el defecto: documentan el estado anterior. Convertir los casos en pruebas que exijan el comportamiento corregido.

| Área | Prueba positiva mínima | Prueba negativa/de regresión |
| --- | --- | --- |
| Autenticación | Alta/invitación → login → sesión → logout | Clave inválida, usuario inactivo, JWT vencido, rate limit y clave de configuración ausente |
| Autorización | Cada rol accede a sus operaciones acordadas | Recepción intenta leer/crear historia por ambos endpoints; médico intenta métricas administrativas; objeto fuera de alcance |
| Paciente | Alta sin email, edición, búsqueda y archivo | Documento duplicado, fecha inválida/futura según política, paciente inexistente, preselección fuera de primera página |
| Historia/archivo | Médico autorizado registra evolución y adjunto | Archivo excesivo/falso, fallo de Storage/DB, URL caducada, lectura no autorizada y trazabilidad |
| Turnos | Alta, estados, cancelación y reprogramación | Superposición concurrente, especialidad incorrecta, usuario no médico, estado inválido y cambio de zona |
| Inventario | Entrada → salida → reconciliación | Salidas simultáneas, saldo insuficiente, reintento duplicado, PATCH de saldo directo y producto desactivado |
| Cobros | Emisión → pago → caja/KPI | Factura vacía, montos inválidos, repetición de petición y anulación/devolución según reglas |
| Entrega | Checkout limpio → migraciones → build → arranque | Base previa, rollback operativo, falta de configuración y restauración de backups con archivos |

El e2e debe usar un bootstrap con los mismos pipes, filtros y controles del servidor real y una base descartable identificada expresamente como test. El e2e actual crea AppModule sin replicar el ValidationPipe/CORS de `main.ts` y no cubre recorridos de negocio: reemplazar esa falsa sensación de cobertura. Incluir cierre de aplicación y recursos de base al finalizar.

Piloto: recepción y un médico recorren una jornada simulada, después una operación supervisada de alcance acordado. Registrar incidencias, formación y responsable de cada operación. Detener la ampliación del piloto ante exposición de datos, pérdida de registros o inconsistencias de stock/caja.

## Ampliaciones comerciales posteriores

Cada ampliación requiere problema validado, alcance, costo operativo, responsable y métrica. Propuesta de orden, sujeta a descubrimiento:

1. **Recordatorios y confirmación de turnos:** medir ausentismo inicial; proveedor aprobado y plantillas sin diagnósticos ni información clínica innecesaria; reintentos e idempotencia.
2. **Caja y conciliación ampliada:** métodos de pago, pagos parciales, cierre diario y liquidación por profesional según la operatoria real.
3. **Lotes, vencimientos y compras:** comenzar con los insumos críticos del inventario real; no asumir que todos necesitan trazabilidad por lote.
4. **Historia estructurada y documentos:** director médico valida datos, plantillas, autoría y flujo de corrección; conservar la evolución clínica y permisos.
5. **Portal de pacientes e integraciones:** identidad, resultados privados y representantes primero; integración con laboratorio/seguro solo con contraparte concreta.

Para cualquier requisito fiscal, verificar la modalidad actual en la [DNIT](https://www.dnit.gov.py/en/web/e-kuatia/home) con el contador antes de comprometer una integración. No ofrecer el PDF existente como integración fiscal terminada.

## Decisiones de descubrimiento para la siguiente etapa

Estas preguntas no bloquean el diagnóstico ya realizado; sí afectan el diseño de implementación y su presupuesto:

- Fecha objetivo de apertura, cantidad de profesionales, consultorios, sedes y volumen esperado.
- Dónde corre el sistema actualmente, si tiene datos reales y quién puede acceder desde Internet.
- Qué personas tienen funciones clínicas y administrativas, quién puede ver cada historia y cómo se maneja una emergencia.
- Si el alcance solicitado incluye solo comprobantes internos o también emisión fiscal/caja; moneda real de los datos actuales.
- Necesidades de menores, representantes, archivos, firma clínica, conservación y exportación.
- Conectividad del local, equipos compartidos, copias, presupuesto mensual y responsable de soporte.

## Definición de terminado

Una tarea termina cuando la conducta acordada está implementada, sus casos relevantes están verificados, no se exponen datos adicionales, la documentación operativa refleja el cambio y existe evidencia revisable. Pasar lint o «funciona en mi equipo» no sustituye estos criterios. Para lanzamiento se exige cerrar las condiciones del informe, no alcanzar una cifra arbitraria de cobertura.
