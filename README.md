# Surmed CRM — Sistema de Gestión Clínica y Administrativa

Sistema integral de gestión para el **Centro Médico Surmed (Asunción, Paraguay)** que unifica padrón de pacientes, agenda médica por especialidad, evoluciones clínicas con adjuntos privados, control de inventario de insumos y comprobantes internos de cobro.

---

## 1. Arquitectura General

```mermaid
flowchart LR
  subgraph Cliente["Frontend (Next.js 16.4.5 + React 19)"]
    UI["App Router / Dashboard"]
    MW["Middleware de Sesión JWT"]
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
  UI -->|HTTPS + Bearer JWT / Idempotency-Key| Guards
  Guards --> Controllers
  Controllers --> Services
  Services --> PG
  Services -->|URLs firmadas 15 min| SB
  Services --> Audit
  Audit --> PG
```

---

## 2. Matriz de Roles y Permisos (RBAC)

| Capacidad / Recurso | `ADMIN` | `MEDICO` | `RECEPCION` |
| --- | :---: | :---: | :---: |
| Padrón administrativo de pacientes (`GET/POST/PATCH /patients`) | Sí | Sí | Sí |
| Archivar / Reactivar pacientes | Sí (ambos) | No | Reactivar |
| Lectura de historia clínica y adjuntos (`GET /medical-records/patient/:id`) | Sí | Sí | **No (`403`)** |
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
   - Cierre automático de sesión por inactividad (`30 min`) en equipos compartidos del centro.
2. **Privacidad Clínica y Adjuntos (`Fase 0` + `Fase 3`)**:
   - `GET /patients/:id` devuelve únicamente datos administrativos y turnos; jamás incluye `medicalRecords`.
   - Los adjuntos clínicos se validan por tamaño (`<= 10 MB`), MIME y **magic bytes reales** (`.pdf`, `.jpg`, `.png`, `.webp`), se almacenan con clave UUID en bucket privado y se sirven mediante URLs firmadas de 15 minutos con compensación automática ante fallos de base de datos.
   - Las correcciones sobre evoluciones firmadas se registran como **adendas inmutables** (`parentRecordId`) y cada lectura/escritura queda trazada en `AuditLog`.
3. **Integridad de Negocio (`Fase 2`)**:
   - **Zona horaria y fechas**: Toda la agenda y los cortes mensuales operan explícitamente en `America/Asuncion` (`UTC-03:00`). La fecha de nacimiento se persiste como fecha civil (`@db.Date`) sin corrimientos horarios.
   - **Moneda y precisión**: Guaraníes (`PYG`, `es-PY`) respaldados por `Decimal(12, 2)` en PostgreSQL y aritmética exacta en centavos enteros en backend.
   - **Inventario y Turnos**: Actualización condicional atómica de stock con bloqueo por producto, restricción `CHECK (quantity >= 0)` y soporte de `Idempotency-Key`. Validación de no solapamiento de intervalos para médico y paciente.

---

## 4. Requisitos e Instalación Local

### Requisitos previos
- **Node.js** `>= 20.x` y `npm >= 10.x`
- **PostgreSQL** `>= 15` (local o instancia gestionada en Supabase/Neon/RDS)
- Proyecto de **Supabase** con bucket privado `medical-records`

### Configuración de variables de entorno

1. Copiar `backend/.env.example` a `backend/.env`:
   ```env
   DATABASE_URL="postgresql://usuario:password@localhost:5432/surmed_crm?schema=public"
   JWT_SECRET="reemplazar_por_secreto_aleatorio_de_al_menos_32_caracteres"
   SUPABASE_URL="https://tu-proyecto.supabase.co"
   SUPABASE_KEY="service_role_key_privada_del_servidor"
   FRONTEND_URL="http://localhost:3001"
   PORT=3000
   ```
2. Copiar `frontend/.env.example` a `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:3000"
   ```

### Instalación y migraciones

```bash
# 1. Instalar dependencias del backend y generar cliente Prisma
cd backend
npm ci
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
cd frontend && npm run dev
```

### Pruebas, Lint, Typecheck y Build de Producción
```bash
# Backend
cd backend
npm run lint:check
npm run typecheck
npm test -- --runInBand
npm run build
npm run start:prod

# Frontend
cd ../frontend
npm run lint
npm run typecheck
npm run build
```

---

## 6. Continuidad Operativa, Backups y Alcance Conocido

- **Backups y Restauración**: El procedimiento completo de copias de PostgreSQL, resguardo del bucket `medical-records`, contingencia en papel ante cortes de energía/Internet y verificación post-restore (`npm run backup:verify`) está documentado en [`docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md`](docs/auditoria-2026-11-04/OPERACION-Y-CONTINUIDAD.md).
- **Alcance Fiscal (Paraguay)**: Los comprobantes generados por el módulo de facturación y su PDF descargable son **comprobantes internos administrativos de control de caja**. No constituyen documentos tributarios electrónicos validados ante el sistema **e-Kuatia / SIFEN de la DNIT**.
- **Protección de Datos Personales (Ley 7593/2025)**: El diseño aplica control de acceso por mínimo privilegio, auditoría inmutable de lecturas clínicas y redacción de datos sensibles en logs como preparación técnica para las exigencias de confidencialidad de datos de salud en Paraguay.
