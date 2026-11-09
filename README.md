# Alerta Trujillo

Aplicación web adaptable a celulares para consultar y reportar incidencias urbanas en Trujillo. El flujo del piloto conecta el reporte vecinal con una revisión antes de mostrarlo en el mapa público.

## Demostración local en Windows

Abre esta carpeta en Visual Studio Code. Desde la raíz, ejecuta los siguientes bloques en dos terminales PowerShell. Se probó con Node.js 22 y Python 3.14.

**Terminal 1 · API**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:APP_MODE = 'demo'
.\.venv\Scripts\python.exe -m app.manage seed-demo
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

**Terminal 2 · Interfaz**

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abre [la interfaz](http://127.0.0.1:5173) y entra a **Perfil**. Usa **Vecino** para enviar un reporte y verificar que aparece en **Mis reportes**. Sal de la cuenta y entra como **Moderador**. En **Revisión**, elige publicar o rechazar. Si publicas, escribe un resumen apto para consulta pública y selecciona el nivel de riesgo.

El modo demostración usa `backend/demo.db` y cuentas ficticias. Puedes probar el flujo sin crear un proyecto en Supabase. Los mapas base se cargan desde OpenStreetMap por internet. Para cambiar de proveedor, configura `VITE_MAP_TILE_URL` y `VITE_MAP_ATTRIBUTION` al compilar, según las condiciones del proveedor.

Si la carpeta `frontend/dist` ya está compilada, puedes usar solo la **terminal 1** y abrir [la compilación en FastAPI](http://127.0.0.1:8000).

## Arquitectura y conexión a Supabase

```text
React + TypeScript → FastAPI → PostgreSQL alojado en Supabase
```

La aplicación React consume rutas del mismo origen bajo `/api`. En desarrollo, Vite reenvía esas rutas a FastAPI. Para servir la compilación con FastAPI, ejecuta `npm.cmd run build` en `frontend` antes de levantar el backend.

1. Crea un proyecto en Supabase. En **Connect**, copia la conexión de **Session pooler** si trabajas desde una red IPv4.
2. Copia `backend/.env.example` a `backend/.env`. En `DATABASE_URL`, cambia el prefijo `postgresql://` a `postgresql+psycopg://`. Usa la contraseña codificada para URL y configura SSL. Para verificar la identidad del servidor, usa `sslmode=verify-full` y el certificado raíz de tu proyecto con `sslrootcert`.
3. Con `APP_MODE=production` y desde `backend`, ejecuta `.\.venv\Scripts\python.exe -m app.manage init-db`. Se crea el esquema privado `alerta_trujillo`. Mantén ese esquema fuera de los esquemas expuestos por la Data API de Supabase.
4. Crea una cuenta autorizada con `.\.venv\Scripts\python.exe -m app.manage create-moderator tu-correo@example.com "Nombre"`. El comando pide la contraseña de forma interactiva.
5. Sirve la aplicación por HTTPS en un mismo origen para que funcione la cookie de sesión segura. La credencial de PostgreSQL va únicamente en el entorno del backend.

[Conexión a PostgreSQL en Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

## API y Postman

Importa `postman/Alerta-Trujillo.postman_collection.json` y ejecuta la colección en orden contra la API local con los datos de demostración. La colección registra una cuenta de prueba distinta en cada ejecución, envía un reporte, verifica los permisos, lo publica y comprueba qué información se hace pública. Postman conserva la cookie de sesión. Las solicitudes que cambian datos requieren el encabezado `X-Alerta-Client: 1`.

Consulta el [esquema interactivo de FastAPI](http://127.0.0.1:8000/docs) para ver las rutas y sus parámetros.

## Git y revisión

El repositorio tiene una rama base `main` y una rama de implementación `feat/mvp-Fabricio`. Cuando crees el repositorio en GitHub, puedes subir ambas ramas y abrir un pull request de la segunda hacia `main`.

```powershell
git remote add origin https://github.com/TU-USUARIO/Alerta-Trujillo.git
git push -u origin main
git push -u origin feat/mvp-ciudadano
```

En **Settings → Collaborators** puedes invitar al equipo. En **Settings → Rules** puedes requerir pull requests para `main` si el plan de tu repositorio incluye esa protección. [Reglas de protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Alcance de esta primera versión

Incluye registro por correo, mapa, filtros, reportes georreferenciados, perfil, respuestas vecinales, guías iniciales y revisión con historial. El mapa publica únicamente un resumen de moderación, un distrito, una hora aproximada y una ubicación redondeada. Los votos se guardan como aportes vecinales y la decisión de publicación corresponde a moderación.

Los adjuntos, comentarios, alertas push, mapa térmico, recuperación de cuentas, repositorio de lecciones y panel de indicadores quedan para otras etapas. Antes de abrir un piloto público, faltan validación de correo, límites de intentos y de envío, una política de conservación de datos y verificación de la instalación en Supabase.
