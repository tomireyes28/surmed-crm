# Revisión visual y PDF — cierre local de etapa 3

Fecha de finalización: 9 de noviembre de 2026. Base: `8fb9af4`. Rama `codex/etapa-1-integridad`. Sin push, sin datos del centro ni acceso a Supabase remoto.

## Entorno y alcance

Se usó navegador real con API Nest, PostgreSQL 17.6 descartable y Next.js; primero desarrollo para corregir y después build/start de producción para verificar sesiones y presentación final. Resoluciones principales: 1440×900 y 390×844; también se observó la vista de escritorio por defecto de 1280×720. Móvil significa viewport de navegador: no certifica Safari/iOS/Android en dispositivos físicos. No se ejecutó un lector de pantalla ni una auditoría WCAG completa.

Los tres usuarios, pacientes, notas, movimientos, turnos y comprobantes eran sintéticos. El fixture reemplaza únicamente Storage por objetos en memoria: no acredita políticas ni conectividad de Supabase. No se enviaron mensajes ni se modificaron datos del cliente.

## Recorridos ejecutados

| Rol / Área | Verificación y resultado |
| --- | --- |
| ADMIN | Login/dashboard con indicadores, staff y especialidades visibles, lista de pacientes y ficha administrativa. Panel de asignación presente y acceso clínico restringido. Comprobantes cobrados, pendientes y anulados distinguibles; cobrado sin acción de anular. |
| MEDICO | Login/dashboard sin indicadores de caja, menú de tres módulos; agenda de día en móvil y semana en escritorio, detalle a las 12:00 de Paraguay y cambio de CONFIRMED a IN_WAITING_ROOM. Historia del paciente asignado, segunda página de 6 notas, nueva evolución desde móvil que vuelve a página 1 y adenda que conserva el original. Paciente sin relación muestra restricción y conserva ficha administrativa. Ruta directa de facturación muestra acceso restringido. |
| RECEPCION | Login/dashboard sin importes de caja, acceso a inventario y facturación. Inventario: segunda página, búsqueda del insumo 31, regreso a página 1 e ingreso sintético que cambia saldo 6→7. Ficha administrativa sin historia, ruta directa de staff restringida. Descarga de PDF disponible, sin acción de anular sobre PAID. |
| Móvil y teclado | Menú modal con enlaces por rol; Tab/Shift+Tab circulan dentro y Escape cierra devolviendo foco al botón. Diálogo de contraseña usa el mismo componente, con etiquetas de campo y cierre por Escape; no se cambió contraseña desde navegador. Modal de turno legible en 390 px. Documento sin desborde horizontal global a 390 px; tablas conservan desplazamiento horizontal propio. |
| Producción local | Ingreso y navegación observados con ADMIN, MEDICO y RECEPCION; sesión de Next en modo producción y reingreso. Capturas finales sin herramientas de desarrollo. Cierre de sesión vuelve al formulario. |

Los recorridos prueban estas operaciones concretas; no se afirma haber ejecutado todos los CRUD, formularios administrativos ni todas las combinaciones posibles de permisos. Los controles de API se complementan con las regresiones automatizadas.

## Hallazgos corregidos

1. El lateral de 256 px dejaba solo 119 px al contenido móvil y producía desborde. Ahora se oculta en móvil y se abre en un modal accesible. En escritorio mantiene expansión/contracción y los enlaces conservan nombre accesible aun con solo iconos. El contenido ocupa el viewport y tiene scroll independiente.
2. La preferencia oscura del sistema cambiaba el texto heredado a blanco aunque las superficies seguían blancas. Se fija el esquema claro que implementa el producto, haciendo legibles asignaciones, recuperación y paginación; no se altera la preferencia del sistema del usuario.
3. Una ruta directa de un módulo prohibido mostraba controles y un error de conexión por el 403. El layout verifica el módulo con la misma matriz de navegación y muestra restricción sin montar el contenido. Esto complementa los guards; no sustituye la autorización del backend.
4. Se ofrecía anular un PAID, operación que la API ya rechazaba. La acción solo aparece para PENDING.
5. El diálogo de contraseña no tenía el manejo común de foco/Escape y etiquetas asociadas a sus inputs. Se reutilizó AccessibleModal y se asociaron etiquetas/autocompletado. La adenda ahora dice “Guardar adenda”, sin sugerir firma digital, y tiene nombre accesible. Los botones de nuevo turno conservan nombre cuando se oculta su texto en móvil.
6. La agenda abre en vista de día en móvil y semana en escritorio. El scroll inicial se fija a las 08:00 y las fechas auxiliares de límites horarios usan una referencia consistente; el instante original del turno no cambia.

## PDF real revisado

Se descargaron desde la interfaz tres archivos reales producidos por jsPDF: PENDING de una página, CANCELLED de una página y PAID de cinco páginas con 70 conceptos, nombre extenso, acentos y precios con decimales. Se renderizaron con Poppler y se inspeccionaron todas las páginas; pypdf comprobó la presencia de cada concepto una sola vez, total, identificación y pies. Poppler emitió avisos de fuentes de sustitución; las páginas resultantes fueron legibles.

Antes, un concepto quedaba partido entre hojas, las páginas siguientes no tenían identificación ni número y el PDF de muestra pesaba 8.377.135 bytes. Ahora las filas que caben completas no se parten, las continuaciones repiten código/estado, todas las páginas tienen aviso no fiscal y numeración, y el total queda fuera del pie. Una fila mayor que una página todavía debe dividirse para poder imprimirse. Se conserva el diseño institucional y se respeta la proporción del logo. El mismo ejemplo con logo pesa 351.840 bytes tras compresión, sin cambiar los importes.

Se separó `buildInvoicePDF` de la descarga para probar el generador real. Las tres pruebas nuevas cubren PENDING/PAID/CANCELLED, fallback sin logo, nombres extensos, 70 conceptos con marcas de principio/fin en una misma hoja, identificación y aviso en cada página, total final y tamaño acotado. Esas pruebas se ejecutan con `npm test` y quedan dentro del job frontend existente de CI. Los PDF de prueba se conservaron localmente en `output/pdf/` y sus renders en `tmp/pdfs/`, excluidos de Git; se pueden regenerar con el fixture. No son comprobantes del cliente.

## Evidencia y verificaciones

- [ADMIN: asignaciones sin lectura clínica](evidencia/admin-acceso-clinico.jpg).
- [MEDICO: semana en escritorio](evidencia/medico-agenda-escritorio.jpg).
- [MEDICO: día en móvil](evidencia/medico-agenda-movil.jpg).
- [RECEPCION: navegación móvil](evidencia/recepcion-menu-movil.jpg).

| Verificación final | Resultado |
| --- | --- |
| Frontend: build, lint y tipos | Pasan |
| Frontend: fechas y PDF | 7 pruebas pasan |
| Backend: unitarias | 62 pruebas / 10 suites pasan |
| Backend: regresión HTTP | 11 pruebas pasan |
| Seguridad con PostgreSQL y BFF de producción | 18 comprobaciones pasan |
| Fixture visual | Sintaxis validada; usado para recorridos manuales |

No se reejecutaron en esta revisión las 19 pruebas de integridad ni las 6 de entrega: su última ejecución exitosa corresponde a la etapa 3 anterior y no se modificó ese código de negocio. El workflow remoto no se ejecutó porque no se hizo push.

## Reproducción

Preparar una base **descartable** local `surmed_visual_test`, aplicar las once migraciones y compilar ambos proyectos. Desde backend:

```powershell
$env:DATABASE_URL='postgresql://usuario:clave@127.0.0.1:puerto/surmed_visual_test'
npx prisma migrate deploy
$env:VISUAL_TEST_DATABASE_URL=$env:DATABASE_URL
$env:VISUAL_PRODUCTION='1' # omitir para next dev
npm run test:visual
```

El script rechaza hosts no locales y otros nombres de base. **Elimina datos de esa base** y deja API/web en loopback, puertos 55601/55602. Abre la web en `http://localhost:55602` (APP_ORIGIN exacto). Los usuarios sintéticos y manifiesto están en `backend/.tmp/visual-fixture.json`; nunca reutilizar sus contraseñas fuera de pruebas. Para detenerlo, crear `backend/.tmp/visual-stop`; el fixture cierra sus servidores/pools. Al terminar se eliminó el contenedor PostgreSQL temporal de esta revisión.

## Próximo cierre

La revisión local de navegador/PDF pedida queda cubierta. Continúan los pendientes dependientes del establecimiento: staging con Supabase real y políticas/privilegios, comprobación en dispositivos del personal, backup y restauración medidos, capacitación, piloto y aceptación. Esta evidencia no acredita despliegue, certificación legal o seguridad completa de infraestructura.
