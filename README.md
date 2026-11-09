# Alerta Trujillo

Aplicación web adaptable a celulares para consultar y reportar incidencias urbanas en Trujillo. El flujo del piloto conecta el reporte vecinal con una revisión antes de mostrarlo en el mapa público.

## Ejecutar localmente en Windows

La aplicación necesita dos servidores en desarrollo: FastAPI para la API y Vite para la interfaz. Abre la carpeta del repositorio en Visual Studio Code y usa dos terminales PowerShell. Deja ambas terminales abiertas mientras pruebas.

Requisitos usados para esta versión: Python 3.14 y Node.js 22.

### 1. Preparar y arrancar la API

La creación del entorno virtual y la instalación se hacen solo la primera vez. En la terminal 1, desde la raíz del repositorio:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

En cada sesión, desde la raíz y en esa misma terminal, activa el modo de demostración y arranca FastAPI:

```powershell
cd backend
$env:APP_MODE = 'demo'
.\.venv\Scripts\python.exe -m app.manage seed-demo
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

No cierres esta terminal. La API debe responder en [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) con `{"status":"ok","mode":"demo"}`.

### 2. Preparar y arrancar la interfaz

La primera vez, instala los paquetes desde la raíz en la terminal 2:

```powershell
cd frontend
npm.cmd ci
cd ..
```

En cada sesión, desde la raíz y en la terminal 2, inicia Vite:

```powershell
cd frontend
npm.cmd run dev
```

No cierres esta terminal. Abre [http://127.0.0.1:5173](http://127.0.0.1:5173). En desarrollo, Vite reenvía las rutas `/api` a FastAPI en el puerto 8000; por eso deben estar activos los dos servidores.

### Probar desde el celular

Esta versión es una aplicación web de React y Vite, no un proyecto Expo/React Native. Expo Go no abre esta URL; usa el navegador del celular. Para Expo Go haría falta crear una interfaz nativa Expo aparte.

1. Conecta la PC y el celular a la misma red local. En la PC ejecuta `ipconfig` y busca la dirección IPv4 del adaptador conectado, por ejemplo `192.168.18.11`. No uses `localhost` ni `127.0.0.1` en el celular: esas direcciones apuntan al propio teléfono.
2. En la terminal 2, detén Vite con `Ctrl+C` y vuelve a iniciarlo usando la IPv4 de tu PC:

   ```powershell
   npm.cmd run dev -- --host 192.168.18.11
   ```

   Reemplaza `192.168.18.11` si `ipconfig` muestra otra dirección.
3. En Chrome o Safari del celular abre `http://192.168.18.11:5173`. Vite mantiene el proxy de `/api` hacia FastAPI en la PC.

Si no conecta, confirma que ambos equipos estén en la misma red y que Windows Firewall permita Node.js en redes privadas. No hace falta exponer FastAPI directamente al celular.

### 3. Probar el flujo de demostración

En la interfaz, entra a **Perfil** y selecciona el acceso **Vecino**. Envía un reporte desde **Reportar**. Luego sal de la cuenta, vuelve a **Perfil** y entra como **Moderador**. En **Revisión**, publica el reporte con un resumen público y un nivel de riesgo. El mapa muestra los reportes publicados; las ubicaciones y descripciones de demostración son ficticias.

Los accesos de demostración también se pueden introducir manualmente:

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Vecino | `vecino@example.com` | `VecinoDemo26!` |
| Moderador | `moderador@example.com` | `ModeradorDemo26!` |

El modo demo guarda sus datos en `backend/demo.db`. No requiere crear un proyecto de Supabase.

### Si faltan partes de la pantalla o del mapa

- Si la página muestra un error de conexión, confirma que la terminal de FastAPI sigue abierta y que `/api/health` responde en el puerto 8000.
- Si faltan los filtros, alertas u otras secciones, confirma que abriste el puerto **5173** y que el catálogo de la API carga. No abras `frontend/index.html` directamente como archivo.
- El mapa base usa mosaicos de OpenStreetMap y necesita internet. Si ves el aviso de que el mapa base no está disponible, revisa la conexión o el acceso de red a `tile.openstreetmap.org`; los controles y los reportes pueden seguir funcionando.
- Si el mapa base aparece pero no muestra puntos, restablece los filtros. Solo se dibujan reportes publicados dentro del periodo seleccionado.

### Ejecutar con un solo servidor

En un clon nuevo, `frontend/dist` todavía no existe. Para que FastAPI también sirva la interfaz, compílala una vez y luego arranca el backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\frontend
npm.cmd ci
npm.cmd run build
cd ..\backend
$env:APP_MODE = 'demo'
.\.venv\Scripts\python.exe -m app.manage seed-demo
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Abre [http://127.0.0.1:8000](http://127.0.0.1:8000). La compilación se actualiza al ejecutar `npm.cmd run build` de nuevo.

## Arquitectura y conexión a Supabase

```text
React + TypeScript → FastAPI → PostgreSQL alojado en Supabase
```

La aplicación React consume rutas del mismo origen bajo `/api`. En desarrollo, Vite reenvía esas rutas a FastAPI. Para producción local o despliegue en un mismo origen, ejecuta `npm.cmd run build` en `frontend` antes de levantar FastAPI.

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

El repositorio de GitHub es privado y tiene las ramas `main` y `feat/mvp-Fabricio`. Clona el repositorio y trabaja en la rama de implementación:

```powershell
git clone https://github.com/SebastianHDC/Alerta-Trujillo.git
cd Alerta-Trujillo
git switch feat/mvp-Fabricio
```

Después de hacer cambios, crea commits en esa rama y súbelos para abrir un pull request hacia `main`:

```powershell
git add .
git commit -m "feat: describe el cambio"
git push -u origin feat/mvp-Fabricio
```

En **Settings → Collaborators** puedes invitar al equipo. En **Settings → Rules** puedes requerir pull requests para `main` si el plan de tu repositorio incluye esa protección. [Reglas de protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Alcance de esta primera versión

Incluye registro por correo, mapa, filtros, reportes georreferenciados, perfil, respuestas vecinales, guías iniciales y revisión con historial. El mapa publica únicamente un resumen de moderación, un distrito, una hora aproximada y una ubicación redondeada. Los votos se guardan como aportes vecinales y la decisión de publicación corresponde a moderación.

Los adjuntos, comentarios, alertas push, mapa térmico, recuperación de cuentas, repositorio de lecciones y panel de indicadores quedan para otras etapas. Antes de abrir un piloto público, faltan validación de correo, límites de intentos y de envío, una política de conservación de datos y verificación de la instalación en Supabase.

