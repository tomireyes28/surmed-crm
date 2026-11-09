# Surmed — Web Next.js

Next.js App Router y React, con BFF del mismo origen en `/api/backend`. Requiere Node.js >=22. El navegador no recibe el JWT de login en JSON: Next lo conserva en cookie HttpOnly. La API sigue autorizando cada operación.

Copiar `.env.example` a `.env.local`, configurando `API_URL` (URL del backend accesible desde Next) y `APP_ORIGIN` (origen público exacto de la web).

```powershell
npm ci
npm run dev -- --port 3001
```

En producción usar HTTPS, `APP_ORIGIN` con el origen HTTPS correcto, `npm run build` y `npm run start -- --port 3001`. Sin origen configurado se rechazan las escrituras. El build descarga Geist mediante next/font/google; requiere conexión de salida durante compilación.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` ejecuta las utilidades reales de calendario y fecha civil en UTC, Los Ángeles, Berlín y Kiritimati, incluyendo cambios estacionales y cambio de día en Paraguay. La proyección de fechas del calendario solo se usa para presentar campos civiles; los turnos se guardan con el instante original y no con esa proyección.

Ver [README raíz](../README.md) y [etapa 3](../docs/auditoria-2026-11-08/ETAPA-3-IMPLEMENTADA.md). La prueba del BFF con PostgreSQL se ejecuta desde backend con `TEST_BFF=1` después de compilar ambos proyectos. No equivale a QA visual de navegador o revisión del PDF.
