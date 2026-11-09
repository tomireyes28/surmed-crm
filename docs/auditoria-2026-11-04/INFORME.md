# Auditoría de Surmed y evaluación técnica

> Estado histórico del 04/11/2026. Las correcciones posteriores y los pendientes actuales están revisados en [Estado y plan de cierre del 08/11/2026](../auditoria-2026-11-08/ESTADO-Y-PLAN-DE-CIERRE.md).

Fecha: 4 de noviembre de 2026. Código revisado: `50c0e60b8e5a8807649b92c624f9db4b5620777d`.

## Dictamen

El proyecto es un MVP con alcance real y una base tecnológica adecuada para Surmed. La división de Nest por dominios, PostgreSQL con Prisma y la separación de servicios HTTP del frontend permiten mejorarlo sin reescribirlo. Sin embargo, **esta revisión no lo considera listo para operar con datos reales de salud**: hay fallas verificables de autenticación, autorización, exposición de credenciales, integridad de inventario y reproducibilidad del despliegue.

La prioridad es asegurar y estabilizar lo contratado antes de ampliar el producto. Agregar más tecnologías no resolvería los problemas observados. Una base pequeña, probada y operable aportará más al cliente y al portfolio.

Entregables relacionados: [plan de acción](PLAN-DE-ACCION.md), [reproducciones aisladas](verificar-hallazgos.cjs) y [evidencia](evidencia/).

## Alcance y límites de la revisión

Se leyeron los módulos de autenticación, personal, pacientes, historias clínicas, almacenamiento, especialidades, turnos, inventario, facturación y dashboard; sus DTO, esquemas de formulario, servicios HTTP, páginas, configuración, esquema de datos, migraciones, seed y pruebas existentes. El código generado de Prisma se trató como salida del generador, no como código de negocio escrito por el autor.

Se ejecutaron compilación, comprobación de tipos, lint, la prueba unitaria disponible y consultas de vulnerabilidades de npm. Se construyeron ocho reproducciones aisladas con dobles de Prisma y datos sintéticos. No se ejecutaron seeds, migraciones ni operaciones contra PostgreSQL o Supabase. No se abrió una sesión clínica ni se modificaron datos del cliente. El código de la aplicación quedó sin cambios; se agregaron únicamente los documentos y evidencias de esta auditoría.

No se verificaron la infraestructura desplegada, configuración remota del bucket, RLS de Supabase, TLS, backups efectivos, políticas del proveedor, rendimiento bajo carga ni apariencia visual en navegador. La revisión de UX se basa en el código. El e2e existente importa el módulo completo y puede abrir conexiones: no se ejecutó contra las credenciales locales. Tampoco se auditó exhaustivamente el historial de Git ni el contenido de los Excel comerciales. La ausencia de configuración en el repositorio se informa como falta de evidencia, no como prueba de que el proveedor carezca de ella.

Niveles de evidencia usados:

- **Ejecutado:** fallo o comportamiento observado localmente.
- **Aislado:** comportamiento de código real reproducido con dependencias simuladas; no acredita una prueba de integración completa.
- **Código:** conclusión sustentada por los caminos y controles presentes en el repositorio.
- **Externo:** alerta o referencia consultada en una fuente externa; su aplicabilidad concreta puede requerir validación adicional.

## Verificaciones realizadas

| Verificación | Resultado | Qué demuestra |
| --- | --- | --- |
| Backend: `npm run build` | Pasa | El código compila; no prueba el arranque de producción ni el negocio. |
| Backend: `npm run start:prod` | Falla | Busca `dist/main`; el build produce `dist/src/main.js`. |
| Backend: `npm run test -- --runInBand` | 1 test pasa | Solo verifica `Hello World!`; no cubre dominios. |
| Backend: ESLint sin `--fix` | 0 errores, 1 warning | Promesa de `bootstrap()` sin manejo explícito en `src/main.ts:30`. |
| Frontend: `npm run lint` | Pasa | Lint no detecta todos los errores de tipos ni contratos. |
| Frontend: `npm run build` | Falla | Compila el bundle, pero falla al comprobar el tipo `Specialty`. |
| Frontend: `tsc --noEmit --incremental false` | 5 errores | Tres imports de tipo inexistente y dos usos incorrectos de respuesta paginada. |
| Reproducciones aisladas | 8 observaciones confirmadas | Contraseñas, login, PATCH de inventario, facturas vacías, email vacío, concurrencia simulada, selección de password y ausencia de roles clínicos. |
| `npm audit`, ambos proyectos | Completado | Alertas del árbol de dependencias; ver sección específica. |

No se usó `npm run lint` del backend porque incluye `--fix` y habría modificado código durante la revisión. No se aplicó `npm audit fix`.

## Arquitectura y tecnologías

| Capa | Tecnología declarada | Evaluación |
| --- | --- | --- |
| Frontend | Next.js 16.2.7, React 19.2.4, TypeScript | Adecuados. Predomina el renderizado y acceso a datos desde componentes cliente. No es necesario migrar todo a Server Components para profesionalizarlo. |
| Formularios | React Hook Form, Zod 4 | Buena elección; varias pantallas de edición y personal usan validación manual diferente. |
| Estado y HTTP | Zustand, Axios, js-cookie | Suficientes para el tamaño actual. La sesión está duplicada y necesita un diseño consistente. |
| Interfaz | Tailwind 4, Lucide, react-big-calendar | Adecuados para una herramienta administrativa. Faltan componentes compartidos y accesibilidad. |
| Backend | NestJS 11, TypeScript, Passport/JWT | La organización modular es una fortaleza. Los controles de acceso y DTO no son consistentes. |
| Datos | PostgreSQL, Prisma 7.8, adapter-pg | Buena base relacional. Faltan restricciones de negocio, índices y sincronización de migraciones. |
| Archivos | Supabase Storage, enlaces firmados | Buen punto de partida; falta demostrar privacidad del bucket y controlar subidas y acceso. |
| PDF/importación | jsPDF, autotable, xlsx | Resuelven necesidades concretas; requieren gestión de errores, localización y mantenimiento de dependencias. |
| Calidad | ESLint, Jest, Supertest | Herramientas presentes, cobertura de negocio prácticamente ausente. No hay CI versionada. |

Mantendría un **monolito modular**. No hay evidencia que justifique microservicios, Kubernetes, CQRS o múltiples bases de datos. Un repositorio con frontend/backend y scripts de trabajo comunes puede ser suficiente; adoptar Nx o Turborepo es opcional.

## Hallazgos de seguridad

### S01 — Creación pública de administrador con credenciales fijas · P0 · Código

Evidencia: `backend/src/auth/auth.controller.ts:17` y `backend/src/auth/auth.service.ts:47`.

`GET /auth/seed` no exige autenticación y crea una cuenta ADMIN con credenciales fijas conocidas por el código. La respuesta de creación incluye el registro completo del usuario. Si el administrador no existe, un visitante puede inicializarlo y usar esas credenciales. Si ya existe, este método no le cambia la contraseña: no se afirma que tome cualquier cuenta existente.

**Acción:** retirar la ruta HTTP; aprovisionar el primer administrador mediante un comando operativo controlado con secreto de un solo uso, sin credenciales predeterminadas. Si se usó este mecanismo en un ambiente accesible, revisar esa cuenta, cambiar su contraseña y revocar sus sesiones. Separar inicialización operativa y demo.

### S02 — Contraseñas de personal sin hash y login incompatible · P0 · Aislado

Evidencia: `backend/src/users/users.service.ts:49`, `backend/src/auth/auth.service.ts:27` y `backend/prisma/seed.ts:35`.

El alta de personal persiste directamente `data.password`, con un valor por defecto fijo si no se informa. El seed de médicos también guarda texto plano. El login utiliza `bcrypt.compare`, por lo que una cuenta creada por el flujo actual no autentica con su contraseña. La reproducción confirmó ambos comportamientos.

**Acción:** centralizar el hash para toda creación y cambio de contraseña, eliminar defaults, establecer mínimos y límites, incorporar invitación o cambio inicial y recuperación segura. Las cuentas ya creadas necesitan un tratamiento controlado: identificar registros inseguros y exigir restablecimiento, sin registrar ni exponer los valores. El `upsert` del seed tiene `update: {}`: corregir solo el bloque `create` no arregla usuarios existentes.

### S03 — Historias clínicas accesibles y modificables por recepción · P0 · Código + aislado

Evidencia: `backend/src/medical-records/medical-records.controller.ts:13`, `backend/src/patients/patients.service.ts:57` y `frontend/src/app/dashboard/patients/[id]/page.tsx:54`.

Historias clínicas solo exige JWT. Cualquier usuario activo autenticado puede consultar historias y crear una evolución; el autor se toma del JWT sin exigir rol médico. Además, `GET /patients/:id` incluye `medicalRecords` completos. Aunque la interfaz de recepción muestra «Acceso Restringido», carga ambos endpoints y recibe los datos. Proteger únicamente `/medical-records` dejaría abierto el segundo camino.

**Acción:** definir permisos del lado servidor por operación, paciente y contexto asistencial. Separar ficha administrativa de información clínica, filtrar relaciones en la consulta y exigir permisos clínicos para crear, leer y firmar evoluciones. Determinar con Surmed si ADMIN administrativo puede ver información médica; no asumirlo. Incorporar acceso excepcional justificado para emergencias si el proceso lo requiere.

### S04 — Respuestas que contienen contraseñas · P0 · Código + aislado

Evidencia: `backend/src/appointments/appointments.service.ts:20`, `backend/src/users/users.service.ts:49`, `:65`, `:76` y `backend/src/auth/auth.service.ts:68`.

La creación de turno usa `doctor: true`, que selecciona también `password`. Crear, actualizar y desactivar usuarios devuelve el objeto completo de Prisma. El seed HTTP hace lo mismo. En personal, ese campo incluso puede contener texto plano por S02. El listado de usuarios sí usa `select`, lo que demuestra que ya existe un patrón correcto que se puede extender.

**Acción:** respuestas con listas explícitas de campos públicos y DTO de salida. No devolver modelos persistidos completos. Agregar una comprobación de ausencia de `password` y otros secretos en todas las respuestas y relaciones de usuarios.

### S05 — PATCH de inventario evade validación y admite campos internos · P1 alto · Aislado

Evidencia: `backend/src/inventory/inventory.controller.ts:35`, `backend/src/inventory/inventory.service.ts:42`, `backend/src/users/users.controller.ts:31` y `backend/src/specialties/specialties.controller.ts:36`.

`Partial<CreateProductDto>` es un tipo de TypeScript y en ejecución se refleja como `Object`. El `ValidationPipe` no aplica los decoradores ni el whitelist del DTO. La prueba mostró que `{ quantity: -999, isActive: false }` llega intacto a `prisma.product.update`, permitiendo modificar stock sin movimiento. En especialidades también se pasa el objeto completo a Prisma: deben restringirse campos y relaciones. En personal se escriben campos explícitos, pero la falta de validación sigue permitiendo datos inválidos. No se afirma que cualquier campo arbitrario de Prisma sea aceptado: depende de su esquema y de los tipos enviados.

**Acción:** clases concretas `UpdateProductDto`, `UpdateUserDto` y `UpdateSpecialtyDto`, decoradores de validación y mapeo explícito de campos editables. Stock solo mediante movimientos. En el estado actual ya existe un `UpdateProductDto`, pero el controller no lo utiliza. La [documentación oficial de Nest](https://docs.nestjs.com/application/validation) explica la ausencia de metadatos de genéricos e interfaces.

### S06 — Sesión y configuración de autenticación incompletas · P1 · Código

Evidencia: `backend/src/auth/auth.module.ts:13`, `backend/src/auth/jwt.strategy.ts:14`, `frontend/src/store/authStore.ts:19`, `frontend/src/app/page.tsx:32` y `frontend/src/services/api.ts:11`.

Hay un secreto JWT fijo de respaldo: si falta la variable real, la aplicación puede usar una clave conocida. No se comprobó que esté ocurriendo en un despliegue. La configuración de firma se evalúa al cargar el módulo; conviene evitar depender del orden de carga de `.env`. El token queda en localStorage mediante persist y en una cookie accesible a JavaScript. Esto aumenta el impacto de un eventual XSS; no se detectó aquí un XSS explotable. Logout borra el estado del navegador, sin invalidar un token ya copiado. No hay manejo común de 401, recuperación de sesión ni revocación individual.

Es positivo que la estrategia consulte el usuario actual y rechace cuentas inactivas: desactivar una cuenta sí invalida sus peticiones posteriores, y el rol se toma de la base, no únicamente del JWT.

**Acción:** configuración validada al arrancar, sin fallback, mediante `registerAsync`/ConfigService; diseño único de sesión. Para esta aplicación web, evaluar BFF o sesión en cookie HttpOnly/Secure/SameSite, con medidas CSRF cuando el navegador adjunte automáticamente credenciales. Expiración, inactividad en equipos compartidos, revocación, recuperación y MFA para administradores. Definir el alcance de sesiones antes de implementar refresh tokens.

### S07 — Subidas sin límites locales ni validación de contenido · P1 · Código

Evidencia: `backend/src/medical-records/medical-records.controller.ts:19`, `backend/src/storage/storage.service.ts:13` y `backend/src/medical-records/medical-records.service.ts:14`.

`FileInterceptor('file')` no configura tamaño máximo, cantidad de campos ni filtro. Se confía en extensión y MIME declarados por el cliente, y se usa el buffer en memoria. `accept` del navegador es una ayuda de selección, no una defensa. La subida sucede antes de crear la historia: si la persistencia falla, puede quedar un archivo huérfano. Se generan URLs firmadas por una hora sin otra política de acceso en ese servicio.

**Acción:** autorizar primero, validar existencia/actividad del paciente, limitar tamaño y frecuencia, comprobar contenido real y tipos permitidos, nombre generado con UUID, y compensación/borrado ante fallos. Evaluar cuarentena y análisis de malware. Verificar bucket privado, políticas y separación de ambientes. La service-role key solo debe existir en backend. La configuración remota del bucket no fue inspeccionada.

### S08 — Endurecimiento y trazabilidad insuficientes en el repositorio · P1 · Código

Evidencia: `backend/src/main.ts:10`, `:13`, `:24`, `backend/src/dashboard/dashboard.controller.ts:7` y `backend/prisma/schema.prisma`.

No hay límites de intentos de login, auditoría de lectura de historias, registro de anulaciones con actor/motivo ni gestión de sesiones. CORS permite orígenes en general y Swagger está expuesto sin condición de ambiente. Esto no equivale por sí solo a saltarse JWT. El dashboard devuelve ingresos a cualquier rol autenticado aunque la UI solo los muestra a ADMIN, y devuelve stock a médicos aunque el módulo de inventario los restringe.

**Acción:** matriz de permisos aplicada también a métricas, deny-by-default donde corresponda, límites y alertas de acceso, cabeceras de seguridad/CSP compatibles, CORS por configuración y política para documentación en producción. Logs estructurados con identificador de petición, evitando contraseñas, tokens, notas y datos personales innecesarios. Auditoría clínica persistente protegida contra alteración.

## Dependencias: resultados reales de npm

Las primeras consultas fallaron por DNS en el entorno restringido. Una revisión automática bloqueó la consulta externa del frontend; después de la autorización explícita del usuario se completó. Las evidencias JSON están en `evidencia/`. No se actualizaron paquetes.

| Árbol auditado | Críticas | Altas | Moderadas | Bajas | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Backend completo | 2 | 14 | 23 | 2 | 41 |
| Backend con `--omit=dev` | 1 | 11 | 5 | 0 | 17 |
| Frontend completo | 2 | 11 | 10 | 0 | 23 |
| Frontend con `--omit=dev` | 2 | 8 | 2 | 0 | 12 |

Estos son conteos de entradas de dependencias afectadas reportadas por npm, incluidas alertas transitivas. **No son cantidades de ataques demostrados**, ni se deben sumar los árboles completos y de producción. La clasificación de npm tampoco demuestra que cada paquete se ejecute en el flujo afectado.

Priorizar:

- Next **16.2.7**: npm reporta severidad crítica y propone **16.4.5** al momento de la consulta. El [aviso del mantenedor sobre servidores Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) incluye esta versión en el rango afectado. No se verificó el sistema operativo del servidor ni se explotó la alerta. Hay avisos con otras condiciones de activación; clasificarlos antes de cerrar el ticket.
- Multer **2.1.1**: alertas altas, relevantes para una API que procesa multipart. Consultar el [aviso del mantenedor](https://github.com/expressjs/multer/security/advisories/GHSA-72gw-mp4g-v24j), junto con los avisos posteriores guardados en el JSON; actualizar también la versión transitiva de platform-express.
- `proxy-addr` **2.0.7**: alerta crítica transitiva; su relevancia depende de proxies y configuración de confianza. Verificar el camino efectivo en producción.
- Axios **1.17.0**, Zod **4.4.3**, sharp y DOMPurify transitivo: aparecen alertas; separar código de navegador, servidor y herramientas. DOMPurify se clasifica crítico en npm, pero no se demostró que el proyecto use la funcionalidad vulnerable.
- `xlsx` **0.18.5**: npm reporta alto sin arreglo disponible a través de su propuesta automática. Aquí se usa en el seed para archivos locales, no hay un endpoint público de importación. Aislar esa herramienta del runtime y elegir una distribución mantenida o una alternativa tras revisar el importador. No confundir «sin fix en npm audit» con imposibilidad de remediación.

No ejecutar `npm audit fix --force` indiscriminadamente. Algunas propuestas de npm incluyen cambios mayores o downgrades, como herramientas de Jest y ESLint. Resolver por camino de dependencia, revisar los avisos primarios, actualizar en grupos pequeños y repetir las pruebas pertinentes.

## Errores funcionales y de datos

| ID / prioridad | Hallazgo y consecuencia | Evidencia y resolución |
| --- | --- | --- |
| F01 · P1 | El frontend no produce build de producción. | Ejecutado: `Specialty` no se exporta; imports rotos en `NewAppointmentModal.tsx:9`, `staff/new/page.tsx:7`, `users.service.ts:2`. Unificar el contrato con `SpecialtyWithCount` o tipos diferenciados y comprobar todos los consumidores. |
| F02 · P1 | Nuevo turno y nueva factura asignan `{ data, meta }` a un estado `Patient[]`; luego llaman `.map`. | Ejecutado en tsc y confirmado por código: `NewAppointmentModal.tsx:51`/`:56`, `invoices/new/page.tsx:55`/`:56`. Corregir acceso y agregar búsqueda paginada del lado servidor; limitarse a `.data` dejaría disponibles solo los primeros diez pacientes. La preselección de un paciente fuera de esa página también debe funcionar. |
| F03 · P1 | El comando productivo del backend falla después de un build exitoso. | Ejecutado: `backend/package.json` inicia `node dist/main`, pero existe `dist/src/main.js`. Ajustar `include`/`rootDir` del build o el entrypoint de manera coherente; verificar el paquete real desplegado. |
| F04 · P1 | Las migraciones no reproducen el esquema actual. | Código: `Patient.isActive` y `Product.isActive` están en `schema.prisma:46`/`:90`, pero no en ninguna migración versionada. Una base creada solo con ellas carecerá de esas columnas. El estado de la base local no se verificó. Agregar migración hacia adelante y probar desde cero y sobre un esquema previo en bases descartables. |
| F05 · P1 | Posible stock negativo bajo concurrencia. | Aislado: `inventory.service.ts:59` verifica saldo fuera de la transacción; dos salidas de 4 con saldo 5 pasan y dejan -3 en el intercalado simulado. Usar actualización condicional atómica y comprobar filas afectadas dentro de transacción, o aislamiento/bloqueo apropiado con reintentos; restricción CHECK de saldo no negativo como defensa adicional. Validarlo después con PostgreSQL real descartable. |
| F06 · P1 | La agenda admite superposición y asignaciones inválidas. | Código: `appointments.service.ts:10` crea sin comprobar solapamiento, médico activo y rol MEDICO, relación con especialidad ni paciente activo. Una FK solo garantiza existencia. La interfaz ofrece médicos y especialidades independientemente. Validar reglas y cerrar también la carrera entre dos reservas concurrentes; comprobar intervalos, no solo hora de inicio. |
| F07 · P1 | Horarios dependen de la zona del servidor/navegador. | Código: `datetime-local` se envía sin offset y el backend hace `new Date(dto.date)`; dashboard y filtros de mes usan hora local del proceso. Servidor UTC puede mostrar/agendar otra hora. Definir `America/Asuncion`, instantes UTC con offset para turnos y reglas de conversión explícitas. La fecha de nacimiento debe tratarse como fecha civil, idealmente `@db.Date`, sin conversiones horarias. |
| F08 · P1 | Estado de turno sin validación runtime ni reglas de transición. | Código: `appointments.controller.ts:28` recibe un enum como valor primitivo; eso no valida la entrada. Prisma puede rechazar valores desconocidos con error interno; valores válidos permiten transiciones arbitrarias. Crear DTO `@IsEnum` y política de transiciones/roles. Una reprogramación debe conservar historial y reglas de conflicto. |
| F09 · P1 | «Cobrar» crea deuda pendiente y el KPI la suma como ingreso. | Código: `invoices.service.ts:24`, schema estado PENDING y `dashboard.service.ts:18`. No hay endpoint de cobro/pago; la UI distingue anulada/emitida, no pendiente/pagada. Definir factura, pago y caja; separar emitido, cobrado y pendiente. Si la intención es solo registrar comprobantes, cambiar las etiquetas para que no afirmen cobro. |
| F10 · P1 | Dinero en Float y factura sin ítems aceptada por la API. | Aislado para array vacío; código en `create-invoice.dto.ts:23` y `schema.prisma:127`/`:145`. Usar Decimal o unidades monetarias enteras según moneda, con reglas explícitas de redondeo; exigir 1..N ítems y límites de montos/cantidades. El total calculado en backend y la creación anidada de ítems son fortalezas que deben conservarse. |
| F11 · P2 | Email opcional vacío impide crear paciente. | Aislado: formulario inicializa/envía `email: ''`; Zod lo acepta, `@IsEmail` del backend lo rechaza. Normalizar vacío a ausencia o null según contrato y usar el mismo criterio al crear/editar. |
| F12 · P2 | Enlaces a páginas que no existen en el repositorio. | Código: dashboard `page.tsx:71`/`:152` usa `/dashboard/agenda`, la ruta es `/dashboard/appointments`; staff `page.tsx:106` y specialties `page.tsx:149` apuntan a páginas `[id]/edit` ausentes. Implementar los flujos contratados o quitar las acciones hasta que estén completos. |
| F13 · P2 | Búsqueda solo entre diez filas de la página visible. | Código: `patients/page.tsx:54`, `invoices/page.tsx:61`; backend sin búsqueda textual. Puede informar que un paciente no existe cuando está en otra página. Pasar búsqueda al backend con debounce, límites y paginación coherente. Validar `page`, `limit`, mes, año y rol; actualmente `parseInt` acepta entradas parciales y no hay topes. |
| F14 · P2 | Listados clínicos, agenda e inventario sin límites; consultas repetidas. | Código: `appointments.findAll`, `medicalRecords.findByPatient`, `inventory.findAllProducts`; se traen todos los datos. Filtrar agenda por rango visible/médico, paginar historias y buscar productos. Índices según consultas: `(doctorId,date)`, `(patientId,date)`, historias por `(patientId,createdAt)`, facturas por paciente/fecha y movimientos por producto/fecha. Medir con EXPLAIN en datos sintéticos antes de agregar índices indiscriminadamente. |
| F15 · P2 | Errores pueden presentarse como ausencia de actividad. | Código: dashboard y listados registran en consola y muestran valores iniciales/arrays vacíos. Detalle de paciente puede quedar «Cargando…» ante 404/error. Definir loading/error/empty/success, reintento y mensajes accionables; mapear excepciones Prisma a 404/409/400 sin exponer detalles internos. |
| F16 · P2 | Borrados lógicos y especialidades tienen políticas incompletas. | Código: se pueden usar IDs archivados en nuevas operaciones; no hay reactivación. `specialties.remove` solo revisa médicos y luego hace delete; con turnos asociados una FK puede fallar. Contadores incluyen médicos inactivos. Mantener acceso histórico autorizado, impedir nuevos usos indebidos y preferir desactivar especialidades con historial. Evitar dejar al centro sin administrador activo. |
| F17 · P2 | Dashboard contradice inventario y permisos de UI. | Código: `dashboard.service.ts:54` alerta todas las categorías; inventario solo alerta INSUMO_MEDICO. Turnos cancelados cuentan como turnos de hoy sin etiqueta en la lista. El botón Cobrar se limita a ADMIN aunque el backend admite RECEPCION. Centralizar reglas y acordar métricas. La fuga del dato de ingresos se trata en S08. |
| F18 · P2 | Seed mezcla inventario real con demo y duplica registros. | Código: `prisma/seed.ts:92`, `:187`, `:208` usa create para turnos/historias/facturas en cada ejecución. No conecta los médicos de demo con sus especialidades. Separar demo, aprovisionamiento e importación comercial; importador idempotente con preview, validación y reporte de errores. No ejecutar el seed actual en producción. |
| F19 · P2 | Moneda, documentos y teléfono todavía reflejan Argentina. | Código: dashboard usa ARS, comprobantes y precios `$`, placeholders `+54`, etiquetas DNI y locale es-AR. Configurar Surmed para guaraníes/PYG, es-PY, +595 y documento/cédula con soporte a extranjeros según operación. No cambiar importes existentes sin acordar su moneda real. |
| F20 · P2 | Edad calculada solo por diferencia de años. | Código: `patients/page.tsx:117` y detalle `:132`. Antes del cumpleaños la edad se sobreestima un año. Usar fecha civil y un helper único; probar cumpleaños de hoy/mañana y 29 de febrero. |
| F21 · P2 | PDF puede quedar esperando indefinidamente y no identifica anulaciones. | Código: `pdfGenerator.ts:14` espera únicamente onload, sin onerror/timeout; `invoice.status` no interviene y también se permite descargar anuladas. Manejar fallo del logo, estado, moneda y contenido largo; probar paginación y caracteres reales. El total al pie requiere control de salto de página. |
| F22 · P2 | Operaciones repetidas pueden duplicarse. | Código: no hay clave de idempotencia para factura, turno o movimiento. Deshabilitar el botón ayuda, pero no cubre reintentos de red. Definir idempotencia para operaciones relevantes, restricciones de dominio y confirmación de resultado. |

## SOLID, DRY, responsabilidad única y calidad de construcción

| Criterio | Estado observado | Mejora proporcionada al proyecto |
| --- | --- | --- |
| Responsabilidad única / S | Buena separación inicial en backend; AuthService mezcla login y creación de administrador. Páginas mezclan fetch, estado, permisos, formularios y presentación. | Extraer aprovisionamiento, políticas y lógica de dominio; dividir el detalle clínico por responsabilidades. Una página de 300 líneas no viola SRP automáticamente: importan sus razones para cambiar. |
| Abierto/cerrado / O | Reglas de roles, estados, moneda y stock dispersas en condiciones. | Políticas pequeñas de permisos y transición; configuración de moneda/centro y helpers compartidos. Evitar estrategias abstractas para operaciones que todavía no varían. |
| Sustitución / L | Hay poca herencia de dominio. No hay evidencia suficiente de una violación concreta. | No inventar jerarquías para demostrar SOLID. Verificar contratos si se introducen adaptadores o implementaciones alternativas. |
| Segregación de interfaces / I | Servicios relativamente pequeños; algunas respuestas contienen más campos y relaciones de los que necesita su consumidor. | Contratos específicos para ficha administrativa, resumen de médico, historia y métricas. No toda respuesta grande es una infracción formal de ISP. |
| Inversión de dependencias / D | Nest usa inyección, pero servicios dependen directamente de PrismaService y StorageService concreto. | Es aceptable para CRUD de este tamaño. Introducir puertos estrechos donde aporten valor real: almacenamiento, notificaciones o integraciones fiscales. Inyección de dependencias no demuestra por sí sola DIP completo. |
| DRY | DTO de actualización repetidos o no usados; roles, badges, moneda, paginación y estado de petición repetidos. Hay clientes Prisma generados duplicados en src aunque se importa @prisma/client. | Tipos API generados desde OpenAPI o contrato compartido acotado; componentes de formulario/estado/paginación y helpers de fecha/dinero. Eliminar código generado obsoleto tras verificar el generador activo. Validar en UI y backend es correcto; lo que debe evitarse es que las reglas diverjan. |
| KISS / YAGNI | El diseño general es simple y comprensible. | Preservarlo. No añadir repositorios genéricos sobre cada método Prisma, bases CRUD heredadas ni servicios distribuidos solo por apariencia profesional. |
| Tipado | Frontend strict, pero tiene errores; backend permite implicit any y apaga algunas reglas. Roles de UI son string. | Corregir contratos, clases DTO y tipos de respuesta; después endurecer TypeScript gradualmente. No usar casts como sustituto de validación externa. |
| Errores y coherencia | Manejo de conflictos parcial, muchas respuestas Prisma directas, formularios de creación y edición distintos. | Convención única de errores, normalización, DTO de salida y misma estrategia de formularios para altas/ediciones. |

El principal problema de diseño es la **inconsistencia entre capas**, con consecuencias demostrables. «Cumplir SOLID» no es una certificación binaria ni reemplaza controles de seguridad y reglas de negocio.

## Evaluación como reclutador y entrevistador técnico

Un reclutador general probablemente valore el stack, el cliente real y la amplitud de funcionalidades. Un entrevistador técnico mirará si las decisiones se sostienen al ejecutar el proyecto, cómo se protegen datos y qué evidencia respalda el funcionamiento.

**Señales favorables:** aplicación de negocio completa en varias áreas, TypeScript a ambos lados, módulos por dominio, inyección de dependencias, relaciones y migraciones, DTO, validación de formularios, cálculo de totales en servidor, transacción de movimientos, borrado lógico en entidades relevantes y commits con intención legible. La estrategia JWT consulta actividad y rol actual de la cuenta. No se observaron consultas SQL crudas construidas con texto de usuario en el código de negocio revisado.

**Señales que hoy restan:** build roto, arranque productivo roto, migraciones incompletas, contraseñas en texto plano, permisos visuales confundidos con autorización, pruebas casi exclusivamente de plantilla, README genéricos y ausencia de proceso de entrega versionado. Los comentarios «FIX», «NUEVO», «acá está la magia», «para que ESLint se calme» cuentan la historia de edición y no explican decisiones; conviene sustituirlos por contexto útil. No se puede deducir la autoría del código ni el nivel profesional de una persona por el estilo de comentarios.

Mi lectura del repositorio es **MVP con señales de desarrollo junior/intermedio y autonomía en implementación**, pero todavía sin evidencias suficientes de madurez productiva. Esto evalúa el estado del artefacto, no una categoría definitiva de su autor. Para mostrar criterio de nivel superior: cerrar las brechas, justificar decisiones y demostrar regresiones y recuperación operativa.

Para portfolio: README propio con problema de negocio, alcance y roles; diagrama de arquitectura y modelo; instalación reproducible y `.env.example` sin secretos; demo aislada con datos sintéticos; decisiones cortas sobre sesiones, autorización, stock y dinero; CI; pruebas de recorridos; capturas autorizadas y una historia antes/después de mejoras. Confirmar autorización del cliente antes de publicar código, marca, Excel, capturas o datos. El proyecto contiene inventario identificado como real por el seed; no asumir que es material público.

## Preparación del establecimiento y oportunidades de ampliación

La frase del dueño se interpreta como falta de tecnología en **su establecimiento**; no como una conclusión sobre Paraguay. Conviene vender resultados medibles y una adopción gradual.

| Propuesta | Problema que resuelve | Prioridad y dependencia | Métrica para validar valor |
| --- | --- | --- | --- |
| Operación de apertura: usuarios individuales, capacitación, manual breve, soporte y contingencia | Evita cuentas compartidas y paralización ante una caída | Antes de abrir; junto con seguridad, backups y prueba de restauración | Personal capaz de completar los flujos y simulacro de caída superado |
| Agenda con horarios médicos, feriados, consultorios y reprogramación | Reduce dobles reservas y errores de recepción | Primero completar integridad de turnos; validar si hay recursos compartidos | Conflictos, tiempo de agendamiento y ocupación |
| Recordatorios y confirmación por WhatsApp/SMS | Reduce ausencias y llamadas manuales | Primera ampliación comercial; consentimiento de contacto, proveedor, cola con reintentos e idempotencia | Ausentismo antes/después y costo por turno confirmado |
| Caja, pagos parciales, métodos de pago, cierre y conciliación | Evita confundir emitido con cobrado y facilita control del dueño | Corregir primero F09; acordar con administración/contador | Diferencia de caja, saldos pendientes y tiempo de cierre |
| Facturación fiscal o integración con proveedor local | Emisión y conciliación tributaria | Descubrimiento con contador y DNIT antes de cotizar | Comprobantes aceptados/rechazados y conciliación |
| Inventario por lote, vencimiento, proveedor, compras y consumo por atención | Reduce faltantes y vencimientos de insumos | Tras corregir saldo y movimientos; depende de los productos reales | Quiebres de stock, pérdidas y cobertura de insumos críticos |
| Historia clínica estructurada: alergias, antecedentes, signos vitales, diagnósticos y documentos | Mejora continuidad asistencial y recuperabilidad de la información | Diseñarla con director médico; permisos, auditoría y versionado primero | Completitud y tiempo de registro; validación clínica de las plantillas |
| Portal de pacientes: turnos y entrega privada de resultados | Reduce trámites y llamadas | Segunda etapa; identidad, representantes/menores, privacidad, accesibilidad y soporte | Autogestión, llamadas evitadas y errores de entrega |
| Indicadores por especialidad, profesional y período | Ayuda a planificar capacidad y compras | Después de estabilizar pagos/estados y definir métricas | Ocupación, espera, ausencias y cobros conciliados |
| Mantenimiento de equipamiento y activos | Evita interrupciones de servicios | Según equipos existentes y necesidad operativa | Preventivos completados y horas de indisponibilidad |
| Conexión con laboratorio, imágenes o seguros | Reduce doble carga | Solo con contraparte, formato y acuerdo concretos | Tiempo de integración y errores de transcripción |

No empezaría por IA clínica, diagnóstico automatizado, app móvil nativa o un ERP completo. Primero validaría los tres problemas operativos con mayor costo para Surmed. Como primera oferta adicional, recordatorios de turnos y caja suelen ser candidatos razonables; esto es una hipótesis para confirmar con el cliente, no una rentabilidad demostrada.

## Paraguay: cuestiones concretas a resolver

El PDF actual y el modelo de Invoice no implementan por sí mismos facturación electrónica: faltan, entre otros, emisor/RUC, datos fiscales, numeración, tratamiento tributario y estados externos. La DNIT ofrece el marco [e-Kuatia/SIFEN](https://www.dnit.gov.py/en/web/e-kuatia/home). La modalidad y obligaciones aplicables deben verificarse con el contador de Surmed antes de definir una integración. Mientras tanto, distinguir el comprobante interno de un documento fiscal validado.

La [Ley 7593/2025](https://www.bacn.gov.py/leyes-paraguayas/12924/ley-n-7593-proteccion-de-datos-personales) regula datos personales y contempla datos de salud. Su artículo 57 establece entrada en vigor veinticuatro meses después de la publicación oficial; no corresponde presentarla como plenamente vigente en la fecha de esta revisión. El [registro legislativo](https://silpy.congreso.gov.py/web/ley/146223) informa publicación el 27/11/2025, por lo que el horizonte de preparación es noviembre de 2027. Revisar cambios reglamentarios al implementar. Esto no elimina deberes actuales de confidencialidad: definir con asesoría local base de tratamiento, accesos, conservación, atención de derechos, menores, incidentes y transferencias a proveedores extranjeros. No asumir que un consentimiento genérico resuelve todo ni que HIPAA es automáticamente aplicable.

## Condiciones para un piloto con datos reales

1. Cero rutas públicas de aprovisionamiento, cero contraseñas persistidas en claro y cero campos password en respuestas.
2. Matriz de permisos aprobada por Surmed y pruebas negativas en todos los caminos de historias, pacientes, archivos y métricas.
3. Build y arranque productivo reproducibles; base nueva creada desde migraciones; seed demo separado.
4. Turnos sin conflictos concurrentes, saldo no negativo, dinero y estados de cobro coherentes, zona y moneda configuradas.
5. Dependencias prioritarias remediadas o con aplicabilidad y mitigación justificadas; controles de subida y acceso probados.
6. Backup de base y archivos, restauración verificada, monitoreo y responsable de incidentes; acordar RPO/RTO con el cliente.
7. Recorridos completos probados con recepción, médico y administrador usando datos sintéticos; luego piloto supervisado con usuarios formados.

El [plan de acción](PLAN-DE-ACCION.md) convierte estas condiciones en tareas, dependencias y criterios de aceptación.
