# Guía de Entrega Reproducible y Clasificación de Dependencias (Fase 1 · T05 y T06)

Fecha de actualización: 4 de noviembre de 2026.

---

## 1. Instalación y Despliegue desde un Checkout Limpio (`T05`)

### Requisitos de entorno
- **Node.js:** `v22.x` (definido en [`.nvmrc`](../../.nvmrc)).
- **PostgreSQL:** `15+`.
- Variables de entorno configuradas a partir de [`backend/.env.example`](../../backend/.env.example) y [`frontend/.env.example`](../../frontend/.env.example).

### Secuencia reproducible para Backend
```bash
cd backend
cp .env.example .env
# Editar .env con DATABASE_URL, JWT_SECRET (>= 16 caracteres) y credenciales de Supabase

npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

- El build compila directamente sobre `dist/main.js` (`rootDir: "./src"` en `tsconfig.build.json`), por lo que `npm run start:prod` (`node dist/main`) levanta el servidor productivo real.
- El health check responde en `GET /health` devolviendo `{ "status": "ok", "service": "surmed-crm-backend", "timestamp": "..." }`.

### Comandos operativos separados (sin mezclar demo con producción)
1. **Aprovisionar primer administrador (`T01` / `T05`):**
   ```bash
   ADMIN_EMAIL="admin@surmed.com.py" ADMIN_PASSWORD="<clave-fuerte>" npm run provision:admin
   ```
2. **Importar inventario comercial desde Excel (`T05` / `F18`):**
   - Vista previa sin escribir en la base (`dry-run`):
     ```bash
     npm run import:inventory:dry-run
     ```
   - Ejecución idempotente real (dos ejecuciones del mismo archivo no duplican productos):
     ```bash
     npm run import:inventory
     ```
3. **Sembrar datos sintéticos de demostración (exclusivo para ambientes de prueba/demo):**
   ```bash
   npm run seed:demo
   ```
   > Bloqueado automáticamente si `NODE_ENV=production`. Nunca usar `prisma migrate reset` sobre una base de datos con información del cliente.

### Secuencia reproducible para Frontend
```bash
cd frontend
cp .env.example .env.local
npm ci
npm run typecheck
npm run build
npm run start
```

---

## 2. Clasificación y Remediación de Alertas de Dependencias (`T06`)

Cada alerta reportada por `npm audit` fue clasificada por cadena de dependencia, entorno de ejecución y funcionalidad efectivamente utilizada:

### Backend (`backend/package.json`)

| Paquete / Cadena | Severidad npm | Entorno | Uso en Surmed CRM | Acción aplicada / Mitigación |
| :--- | :--- | :--- | :--- | :--- |
| `multer` / `@nestjs/platform-express` | Alta | Runtime (API multipart) | Subida de adjuntos en `POST /medical-records` | Actualizado a rango seguro (`multer ^2.5.0`, `@nestjs/platform-express ^11.1.28`) + override de lockfile. |
| `proxy-addr` (transitivo de Express) | Crítica | Runtime HTTP | Resolución de IP detrás de proxy | Fijado mediante `overrides` a `^2.0.8`. |
| `body-parser` / `qs` (transitivos de Express) | Alta / Moderada | Runtime HTTP | Parseo de body JSON y query strings | Fijados mediante `overrides` a `body-parser ^2.4.0` y `qs ^6.16.1`. |
| `js-yaml` / `@nestjs/swagger` | Alta / Moderada | Inicialización de Swagger | Generación de OpenAPI (deshabilitado en `NODE_ENV=production`) | Actualizado `@nestjs/swagger` y fijado `js-yaml ^4.3.2` en `overrides`; además Swagger no se expone en producción (`main.ts`). |
| `fast-uri` (transitivo de validación/esquemas) | Alta | Runtime / Build | Normalización interna de URIs | Fijado mediante `overrides` a `^3.1.9`. |
| `xlsx` (`0.18.5`) | Alta | **Solo CLI local** (`prisma/import-inventory.ts`) | Lectura local de planillas `prisma/data/inv*.xlsx` | **Aislado del runtime productivo:** movido a `devDependencies`; ningún controlador ni servicio de `src/` importa `xlsx`. Solo procesa archivos locales confiables del repositorio. |
| `prisma` (`@prisma/client`, `@prisma/adapter-pg`, `prisma`) | Alta / Moderada | Runtime / CLI | ORM PostgreSQL y cliente de migración | Actualizados a `^7.10.1`, eliminando las alertas transitivas de `@prisma/config` / `@prisma/dev` (`hono`, `deepmerge-ts`, `mysql2`, `valibot`). |
| `@nestjs/mapped-types` | Política | Runtime | DTOs de NestJS | Reemplazado comodín `"*"` por versión semántica explícita `"^2.1.1"`. |

> **Resultado verificado en dependencias de producción (`npm audit --omit=dev`):** `0 vulnerabilities` tanto en `backend` como en `frontend`.

### Frontend (`frontend/package.json`)

| Paquete / Cadena | Severidad npm | Entorno | Uso en Surmed CRM | Acción aplicada / Mitigación |
| :--- | :--- | :--- | :--- | :--- |
| `next` / `eslint-config-next` | Crítica | Runtime / Build | Framework principal (`16.2.7` afectado por `GHSA-p293-qw3h-jr36` y avisos de Image Optimization/Server Actions) | Actualizado a `16.4.5` (versión recomendada por el mantenedor). |
| `axios` | Alta | Cliente HTTP navegador | Peticiones a la API propia (`NEXT_PUBLIC_API_URL`) | Actualizado a `^1.20.0` (corrige ReDoS y prototype-pollution gadgets). |
| `zod` | Alta | Validación de formularios | Esquemas de login, pacientes, turnos, inventario y facturas | Actualizado a `^4.6.6`. |
| `postcss` / `sharp` / `source-map-js` / `nanoid` / `baseline-browser-mapping` | Alta / Moderada | Build / Optimización de imágenes | Compilación de CSS y assets | Actualizados vía `next@16.4.5` y fijados en `overrides`. |
| `dompurify` (transitivo de `jspdf`) | Crítica | Cliente navegador (PDF) | `pdfGenerator.ts` usa `jsPDF` con texto tabular (`autoTable`), sin renderizar HTML arbitrario (`doc.html()`) | No se invoca la función vulnerable (`SAFE_FOR_TEMPLATES` / `IN_PLACE` sobre HTML no confiable); además se fija `dompurify ^3.4.17` en `overrides`. |
| `follow-redirects` / `form-data` / `moment` | Alta / Moderada | Transitivos | Dependencias internas de librerías de UI/HTTP | Fijados en `overrides` a `follow-redirects ^1.16.2`, `form-data ^4.0.6` y `moment ^2.31.0`. |

---

## 3. Controles Automáticos en CI (`.github/workflows/ci.yml`)

El workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) ejecuta en cada push y pull request:
1. Instalación limpia con `npm ci` (respetando `package-lock.json`).
2. `npx prisma generate` (sin clientes duplicados en `src/`).
3. `lint` sin `--fix` (`npm run lint:check` en backend y `npm run lint` en frontend).
4. `npm run typecheck` (`tsc --noEmit --incremental false`) en ambos proyectos.
5. `npm test -- --runInBand` con las pruebas unitarias y de regresión.
6. `npm run build` en ambos proyectos y verificación de existencia de `backend/dist/main.js`.
7. `npm audit --omit=dev --audit-level=high`.
