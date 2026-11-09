# Etapa 3 — consultas, fechas, CI y documentación

> Seguimiento Supabase, 09/11: también se completó la integración real que este documento señalaba pendiente. Ver [Supabase staging](../auditoria-2026-11-09/SUPABASE-STAGING.md): 13 migraciones, permisos limitados y adjuntos reales verificados. El resto del documento conserva los resultados de su fecha original.

> Seguimiento del 09/11: completada la revisión local de navegador y PDF de tres roles, con correcciones y capturas. Ver [Revisión visual y PDF](../auditoria-2026-11-09/QA-VISUAL-Y-PDF.md). La mención a QA pendiente al final de este documento conserva el estado previo a esa revisión; Supabase remoto, dispositivos físicos y aceptación del centro siguen pendientes.

Fecha: 8 de noviembre de 2026. Base: `8f4c289` (etapa 2). Rama `codex/etapa-1-integridad`; trabajo local sin push. No se usaron datos del cliente ni credenciales de Supabase real.

## Implementación

**Agenda:** la web consulta el intervalo visible, también cuando se navega entre mes, semana, día o agenda. El calendario presenta campos civiles de Paraguay y su indicador “ahora” usa la misma zona; la proyección no se persiste como instante. El modal conserva el turno original para cambiar su estado. Las entradas datetime-local siguen interpretándose a -03:00 en backend. La API usa el mes actual sin filtros de fecha, exige ambos extremos cuando se filtra, rechaza rangos invertidos o mayores a 62 días y limita la respuesta a 2000 turnos. Si se excede, devuelve 400 con indicación de acotar el rango o filtrar por médico: no entrega una agenda parcial como si estuviera completa. `from` y `to` son inclusivos.

**Historias e inventario:** rutas paginadas de 25 por defecto, máximo 100, página máxima 10000. Devuelven `{ data, meta: { page, limit, hasMore } }`. Orden secundario por ID para evitar empates ambiguos. La interfaz permite avanzar/retroceder; inventario busca y filtra en servidor, con debounce. Las respuestas anteriores de una búsqueda/navegación no sustituyen la solicitud más reciente. Nuevas evoluciones/adendas vuelven a primera página. Cambiar de paciente inicia en página 1.

Las rutas antiguas conservan respuesta array en volúmenes pequeños; por encima de 100 productos o 50 notas devuelven 400 indicando usar la ruta paginada. No hay truncado silencioso. La web ya usa las rutas nuevas. Los metadatos y validación de adjuntos históricos se limitan a las notas consultadas; los permisos de etapa 2 se aplican también a la ruta paginada. La paginación por offset no es una instantánea entre peticiones: si se insertan notas entre páginas, la lista puede desplazarse; recargar la primera página muestra lo nuevo.

**Fechas:** se rechazan días inexistentes, horas fuera de rango, offsets inválidos y texto sobrante en fechas civiles, evitando la normalización silenciosa de Date. Se conserva la fecha de nacimiento normalizada a mediodía UTC; no hay conversión masiva ni cambio de tipo de columna. La política horaria operativa actual sigue siendo -03:00; no se reconstruyeron reglas históricas de horario estacional para reprogramar turnos antiguos.

**Migración:** `20261108030000_bounded_queries` añade índices para agenda por fecha/ID, inventario por actividad/categoría/nombre/ID y notas por paciente/fecha/ID. No elimina ni reescribe registros. No se afirma que los índices aceleren cualquier búsqueda contains: medir con volumen representativo en staging antes de prometer tiempos.

**CI:** incorpora regresión HTTP, tests frontend de fechas y un job PostgreSQL 17.6 con tres bases descartables. Instala con npm ci, compila ambos servidores, aplica migraciones desde cero, ejecuta integridad de etapa 1, seguridad de etapa 2 con Next de producción y actualización desde las migraciones previas con datos sintéticos. Credenciales de CI sintéticas, sin secretos del centro. Se añadió ejecución manual y permisos contents:read. El YAML se valida localmente; sin push no se ejecutó GitHub Actions remoto.

**Documentación:** README raíz y de ambos paquetes reflejan comandos, puertos, variables y pruebas reales; se retiraron las plantillas genéricas. El procedimiento operativo describe descargas revocables, compensación condicionada al commit, límites de auditoría y RPO/RTO propuestos pendientes de medición/aprobación. No se presenta la aplicación como firma digital, antivirus o certificación de cumplimiento legal. Las auditorías originales mantienen su carácter histórico con enlaces al estado actualizado.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Instalación desde lockfiles | npm ci en backend y frontend pasa |
| Backend unitarias | 62 pruebas / 10 suites pasan |
| HTTP de regresión | 11 pruebas pasan con dobles Prisma/Storage |
| Calendario y fecha civil | 4 pruebas pasan en UTC, Los Ángeles, Berlín y Kiritimati |
| Build y lint | Backend y frontend pasan |
| PostgreSQL: integridad anterior | 19 comprobaciones pasan |
| PostgreSQL + HTTP + Next: seguridad anterior | 18 comprobaciones pasan |
| PostgreSQL + HTTP: entrega | 6 comprobaciones pasan |
| Esquema | 11 migraciones desde cero; actualización desde etapa 2 con datos conservados |
| CI YAML | Parseado y estructura de jobs validada localmente |

Las seis comprobaciones nuevas verifican preservación de paciente/nota/sesión y creación de índices, recorrido sin duplicados/omisiones de 61 notas con timestamps repetidos y 129 productos activos con nombres repetidos, búsqueda/categoría/archivados, parámetros inválidos, permisos negativos de las rutas nuevas, límites de medianoche de Paraguay, rango por defecto y persistencia de fecha civil bisiesta.

Las pruebas frontend incluyen verano/invierno, fechas de cambio estacional de otras zonas, cruce de día en Paraguay, períodos completos y edad de nacimiento bisiesto. Ejecutan las utilidades TypeScript reales con Node; no son una sesión de navegador. Las regresiones PostgreSQL conservan Storage simulado: no acreditan Supabase remoto ni examen visual del PDF.

## Reproducción de integración

Requiere PostgreSQL local temporal y tres bases vacías con los nombres exactos. Compilar ambos proyectos primero. Ejemplo PowerShell, desde backend:

```powershell
$env:DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_integrity_test'
$env:INTEGRITY_TEST_DATABASE_URL=$env:DATABASE_URL
npx prisma migrate deploy
npm run test:postgres
$env:SECURITY_TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_security_test'
$env:DATABASE_URL=$env:SECURITY_TEST_DATABASE_URL
npx prisma migrate deploy
$env:TEST_BFF='1'
npm run test:security
$env:DELIVERY_TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_delivery_test'
npm run test:delivery
```

Los scripts eliminan datos sintéticos de sus bases. El script delivery reconstruye el esquema public de **surmed_delivery_test**, aplica primero las diez migraciones de etapa 2, carga datos y aplica la migración de índices. Todos rechazan hosts no locales y nombres distintos; nunca usar una base con datos útiles. La suite BFF necesita libre el puerto 55602 y lo libera al terminar. El directorio temporal de migraciones se elimina en finally.

## Despliegue y pendientes que requieren el entorno real

1. Backup de base y archivos; aplicar la migración de índices con el rol de migración y evaluar duración/bloqueos según tamaño real. Desplegar API y web juntas. Conservar API_URL y APP_ORIGIN de etapa 2 y HTTPS. No se aplicó esta migración al entorno del cliente.
2. Ejecutar el workflow remoto cuando se autorice publicar. La configuración lista en Git no acredita un run remoto exitoso.
3. En staging, verificar bucket/políticas de Supabase, rol de PostgreSQL con privilegios mínimos, credenciales históricas, volumen y planes de consulta. Las pruebas de esta etapa son de corrección, no un benchmark de capacidad o pentest de infraestructura.
4. QA visual y de teclado en móvil/escritorio con los tres roles, calendario desde otra zona y PDF real de varias páginas. No se marca ese criterio como comprobado por compilar o probar utilidades.
5. Etapa 4: restaurar base y bucket en aislado y medir recuperación, conciliar inventario inicial, capacitar al personal, acordar responsables/soporte y aceptar el piloto. MFA administrativo sigue como decisión pendiente del plan de seguridad.

El trabajo de código solicitado en esta etapa queda separado de la validación operativa del centro; el proyecto todavía no se declara desplegado ni aceptado para apertura.
