# Surmed CRM — Sistema de Gestión Clínica y Administrativa

Sistema integral de gestión para el **Centro Médico Surmed (Asunción, Paraguay)** que unifica padrón de pacientes, agenda médica por especialidad, evoluciones clínicas con adjuntos privados, control de inventario de insumos y comprobantes internos de cobro.

---

## 1. Arquitectura General

```mermaid
flowchart LR
  subgraph Cliente["Frontend (Next.js 16.4.5 + React 19)"]
    UI["App Router / Dashboard"]
    MW["Proxy de navegación + BFF /api/backend"]
    PDF["Generador de Comprobantes PDF"]
  end

  subgraph Servidor["Backend API (NestJS 11)"]
    Guards["JwtAuthGuard + RolesGuard"]
    Controllers["Controladores REST + ValidationPipe"]
    Services["Servicios de Dominio (Transacciones e Idempotencia)"]
    Audit["AuditService + StructuredLogger (Redacción PII)"]
  end

  subgraph Persistencia["Infraestructura de Datos"]
    PG[("PostgreSQL (Prisma 7)")]
    SB[("Supabase Storage Privado (medical-records)")]
  end

  UI --> MW
  UI -->|Cookie HttpOnly / Idempotency-Key| MW
  MW -->|Bearer JWT solo entre servidores| Guards
  Guards --> Controllers
  Controllers --> Services
  Services --> PG
  Services -->|Descarga privada autorizada por solicitud| SB
  Services --> Audit
  Audit --> PG
```

---

## 2. Matriz de Roles y Permisos (RBAC)

| Capacidad / Recurso | `ADMIN` | `MEDICO` | `RECEPCION` |
| --- | :---: | :---: | :---: |
| Padrón administrativo de pacientes (`GET/POST/PATCH /patients`) | Sí | Sí | Sí |
| Archivar / Reactivar pacientes | Sí (ambos) | No | Reactivar |
| Lectura de historia clínica y adjuntos (`GET /medical-records/patient/:id`) | **No (`403`)** | Asignación o turno propio no cancelado | **No (`403`)** |
| Asignar / revocar acceso clínico y emitir recuperación de acceso | Sí | No | No |
| Creación de evolución clínica y adendas (`POST /medical-records`) | **No (`403`)** | **Sí (Exclusivo)** | **No (`403`)** |
| Agenda de turnos y cambios de estado (`GET/POST/PATCH /appointments`) | Sí | Sí | Sí |
| Inventario de insumos y movimientos (`GET/POST/PATCH /inventory/*`) | Sí | **No (`403`)** | Sí |
| Comprobantes internos y cobros (`GET/POST/PATCH /invoices/*`) | Sí | **No (`403`)** | Sí |
| KPIs financieros (`monthlyRevenue`, `monthlyPending`, `monthlyIssued`) | **Sí (Exclusivo)** | `null` | `null` |
| Gestión de Staff (`GET/POST/PATCH/DELETE /users`) y Auditoría (`GET /audit-logs`) | **Sí (Exclusivo)** | Solo lista médicos | Solo lista médicos |

---

## 3. Decisiones Técnicas Clave

1. **Seguridad de Sesión y Credenciales (`Fase 0`)**:
   - Contraseñas almacenadas exclusivamente con hash `bcrypt`. Ningún endpoint devuelve el campo `password`.
   - Rate-limiting en `POST /auth/login` (`429 Too Many Requests`) y revocación inmediata de tokens al cerrar sesión, cambiar contraseña o desactivar un usuario.
   - Cookie HttpOnly, Secure en producción y SameSite strict, con BFF del mismo origen y control de origen/header en escrituras. Inactividad de 30 min comprobada por API y persistida en PostgreSQL, además del temporizador de interfaz.
   - Recuperación: ADMIN verifica identidad, registra el motivo y entrega un enlace de un solo uso de 15 min. La base guarda su hash; al canjear se revocan todas las sesiones y enlaces previos.
2. **Privacidad Clínica y Adjuntos (`Fase 0` + `Fase 3`)**:
   - `GET /patients/:id` devuelve únicamente datos administrativos y turnos; jamás incluye `medicalRecords`.
   - Los adjuntos clínicos se validan por tamaño (`<= 10 MB`), MIME y **magic bytes reales** (`.pdf`, `.jpg`, `.png`, `.webp`). Se almacenan con clave UUID en bucket privado comprobado en ejecución; la descarga pasa por autorización de sesión, paciente y revocación en cada solicitud. Esta validación no es un antivirus. Se conserva compensación ante fallos de base de datos.
   - Las correcciones se registran como adendas (`parentRecordId`); la API no ofrece edición ni borrado de notas ni auditoría. Esto no es firma digital ni protección frente a un administrador de base de datos.
3. **Integridad de Negocio (`Fase 2`)**:
   - **Zona horaria y fechas**: Los cálculos de agenda y cortes mensuales del backend usan `America/Asuncion` (`UTC-03:00`). La fecha de nacimiento conserva `DateTime` normalizado a mediodía UTC y helpers civiles; queda verificar el calendario visual desde otras zonas en la etapa 3.
   - **Moneda y precisión**: Guaraníes (`PYG`, `es-PY`) respaldados por `Decimal(12, 2)` en PostgreSQL y aritmética exacta en centavos enteros en backend.
   - **Inventario y Turnos**: Actualización condicional atómica de stock con bloqueo por producto, restricción `CHECK (quantity >= 0)` y soporte de `Idempotency-Key`. Validación de no solapamiento de intervalos para médico y paciente.

---

## 4. Requisitos e Instalación Local

### Requisitos previos
- **Node.js** `>= 22.x` y `npm >= 10.x`
- **PostgreSQL** `>= 15` (local o instancia gestionada en Supabase/Neon/RDS)
- Proyecto de **Supabase** con bucket privado `medical-records`

### Configuración de variables de entorno

1. Copiar `backend/.env.example` a `backend/.env`:
   ```env
   DATABASE_URL="postgresql://usuario:password@localhost:5432/surmed_crm?schema=public"
   JWT_SECRET="reemplazar_por_secreto_aleatorio_de_al_menos_32_caracteres"
   SUPABASE_URL="https://tu-proyecto.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="service_role_key_privada_del_servidor"
   CORS_ORIGINS="http://localhost:3001"
   PORT=3000
   ```
2. Copiar `frontend/.env.example` a `frontend/.env.local`:
   ```env
   API_URL="http://localhost:3000"
   APP_ORIGIN="http://localhost:3001"
   ```

En producción, `APP_ORIGIN` debe coincidir exactamente con el origen HTTPS público de la web; `API_URL` es la dirección del backend accesible desde Next. Desplegar frontend y backend juntos tras ejecutar migraciones. Ver [etapa 2: verificación y despliegue](docs/auditoria-2026-11-08/ETAPA-2-IMPLEMENTADA.md).

### Instalación y migraciones

```bash
# 1. Instalar dependencias del backend y generar cliente Prisma
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy

# 2. Aprovisionar el primer administrador (sin credenciales hardcodeadas en código)
ADMIN_EMAIL="admin@surmed.com.py" ADMIN_PASSWORD="TuPasswordSegura2026!" ADMIN_NAME="Dirección Surmed" npm run provision:admin

# 3. (Opcional - Solo entornos de prueba/demo) Cargar datos sintéticos de demostración
npx prisma db seed

# 4. Instalar dependencias del frontend
cd ../frontend
npm ci
```

---

## 5. Ejecución y Verificación

### Desarrollo
```bash
# Terminal 1 — Backend (http://localhost:3000)
cd backend && npm run start:dev

# Terminal 2 — Frontend (http://localhost:3001)
cd frontend && npm run dev -- --port 3001
```

### Pruebas, Lint, Typecheck y Build de Producción
```bash
# Backend
cd backend
npm run lint:check
npm run typecheck
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run start:prod

# Frontend
cd ../frontend
npm run lint
npm run typecheck
npm test
npm run build
```

---

## 6. Continuidad Operativa, Backups y Alcance Conocido

- **Backups y Restauración**: El procedimiento completo de copias de PostgreSQL, resguardo del bucket `medical-records`, contingencia en papel ante cortes de energía/Internet y verificación post-restore (`npm run backup:verify`) está documentado en [`docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md`](docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md).
- **Alcance Fiscal (Paraguay)**: Los comprobantes generados por el módulo de facturación y su PDF descargable son **comprobantes internos administrativos de control de caja**. No constituyen documentos tributarios electrónicos validados ante el sistema **e-Kuatia / SIFEN de la DNIT**.
- **Privacidad**: La API aplica roles y relación asistencial, trazabilidad y redacción de secretos/notas en logs. La validación legal, retención, privilegios del rol de base y políticas de Supabase desplegado requieren revisión específica; estas medidas no certifican cumplimiento normativo.

## 7. Consultas, fechas y entrega

- Agenda: carga el período visible en horario de Paraguay, también si el equipo está en otra zona. La API usa el mes actual cuando no se indica período; `from` y `to` deben enviarse juntos, en orden, con un máximo de 62 días. Ambos extremos son inclusivos. Si hay más de 2000 turnos devuelve 400 para que se acote el rango o se filtre por médico; no oculta resultados.
- Inventario: `GET /inventory/products/page` admite `page`, `limit` (1–100), `search`, `category` e `includeInactive`. Historia: `GET /medical-records/patient/:id/page`, con los mismos límites de paginación y autorización clínica. Responden `{ data, meta: { page, limit, hasMore } }`, con orden estable. La interfaz pide páginas de 25. Las rutas antiguas de listas conservan el array para hasta 100 productos o 50 notas; por encima devuelven 400 indicando usar la ruta paginada.
- La migración `20261108030000_bounded_queries` agrega índices, sin reescribir fechas ni datos clínicos. Desplegar API y web coordinadas tras `prisma migrate deploy`.
- CI comprueba HTTP, fechas en cuatro zonas, migraciones desde cero, actualización con datos previos e integridad/seguridad con PostgreSQL y BFF de producción. El trabajo local sin push no ejecuta GitHub Actions remoto.

Ver [etapa 3: cambios, pruebas y pendientes de entrega](docs/auditoria-2026-11-08/ETAPA-3-IMPLEMENTADA.md) y [procedimiento operativo](docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md).
