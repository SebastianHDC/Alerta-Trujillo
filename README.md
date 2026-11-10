# Alerta Trujillo

Sistema de gestión del conocimiento para incidencias urbanas y seguridad ciudadana en la provincia de Trujillo. Tiene dos partes:

- **App ciudadana** (web adaptable a celulares): mapa normal y térmico, filtros avanzados, alertas cercanas, detalle con validación vecinal («Es real / Es falso»), creación de alertas con foto o video, contactos de emergencia, perfil con puntos y notificaciones.
- **Portal interno del equipo** (`#/portal`): dashboard gerencial, revisión en dos etapas, base de conocimiento versionada, lecciones aprendidas, registro de reutilización y directorio de derivación.

### Ciclo de una alerta

```text
Vecino reporta → En revisión (privado) → el equipo revisa datos sensibles ─┬→ No publicado
                                                                            └→ Sin verificar (visible, los vecinos votan)
                                                                                 → el equipo decide → Verificado | Descartado
```

Los votos vecinales ordenan la prioridad de revisión y dan puntos, pero la decisión final la toma una persona del equipo distinta del autor. La vista pública muestra solo el resumen escrito por moderación, una ubicación redondeada (~100 m) y la hora en punto.

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

### 3. Probar el flujo de demostración

1. Entra como **Vecino** desde **Perfil → Iniciar sesión** y crea una alerta con el botón **+** (puedes adjuntar una foto).
2. Sal y entra como **Moderador**: se abre el portal interno. En **Revisión**, completa la lista de control, escribe el resumen público y publícala como «Sin verificar».
3. Entra como **Vecina**, abre la alerta y valídala con **Es real**.
4. Vuelve como **Moderador** y verifícala. El vecino recibe la notificación y los puntos.
5. Como **Gestor**, revisa el **Dashboard**, crea una guía o lección en **Conocimiento** y apruébala con otra cuenta (quien redacta no puede aprobar su propia versión).

Las ubicaciones y descripciones de demostración son ficticias.

Los accesos de demostración también se pueden introducir manualmente:

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Vecino | `vecino@example.com` | `VecinoDemo26!` |
| Vecina (segundo ciudadano) | `vecina@example.com` | `VecinaDemo26!` |
| Moderador | `moderador@example.com` | `ModeradorDemo26!` |
| Gestor del conocimiento | `gestor@example.com` | `GestorDemo26!` |

El modo demo guarda sus datos en `backend/demo.db` y las evidencias en `backend/uploads/`. `seed-demo` **borra y recrea** la base de demostración cada vez. No requiere crear un proyecto de Supabase.

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

## Módulos del portal (avance para el docente)

El portal del equipo (`#/portal`, modo web) organiza el Sistema de Gestión del Conocimiento en siete módulos:

| Módulo | Ruta | Qué permite demostrar |
| --- | --- | --- |
| M1 · Inicio / Dashboard | `#/portal` | Accesos a los módulos y resumen de reportes, revisión y conocimiento. |
| M2 · Usuarios y roles | `#/portal/usuarios` | Cuentas de vecinos y del equipo, rol, función en el SGC, activar o desactivar, alta de cuentas con contraseña temporal y matriz de permisos. |
| M3 · Base de conocimiento | `#/portal/conocimiento` | Documentos, procedimientos (pasos numerados), manuales, videos (enlace o archivo), guías y preguntas frecuentes, con adjuntos, versiones y aprobación por otra persona. |
| M4 · Lecciones aprendidas | `#/portal/lecciones` | Fichas con problema, solución, responsable y fecha, además de resultado, límites y reutilizaciones. |
| M5 · Mapa de conocimiento | `#/portal/mapa` | Diagrama interactivo personas → funciones → áreas, riesgo de continuidad y búsqueda «¿A quién pregunto?». |
| M6 · Indicadores | `#/portal/indicadores` | Diez indicadores con fórmula, meta, semáforo y evolución semanal. |
| M7 · Reportes | `#/portal/reportes` | Reportes filtrados por periodo, distrito, categoría y estado; impresión o PDF y exportación a CSV (Excel). |

Cuentas del equipo en modo demo: `gestor@example.com` / `GestorDemo26!` (gestión), `moderador@example.com` / `ModeradorDemo26!`, `coordinacion@example.com` / `CoordinaDemo26!`, `analista@example.com` / `AnalistaDemo26!` y `enlace@example.com` / `EnlaceDemo26!`. `suspendida@example.com` muestra una cuenta desactivada.

### Migraciones de Supabase

El esquema vive en `supabase/migrations/` y se aplica en orden: `20261110210000_alerta_trujillo_schema.sql` crea las tablas y `20261111090000_modulos_portal.sql` agrega la función y el estado de las cuentas, los nuevos tipos de recurso y los adjuntos. Con la CLI de Supabase: `supabase db push`. Los modelos de SQLAlchemy y las migraciones deben mantenerse iguales; cualquier columna nueva necesita su propia migración.

## App instalable (PWA)

La app ciudadana es una PWA: se instala en el celular o la computadora, abre a pantalla completa y conserva el mapa y las últimas alertas públicas aunque falle la señal. El portal del equipo (`#/portal`) está pensado para usarse en **modo web**, en una computadora; si se abre desde la app instalada, muestra un enlace para abrirlo en el navegador.

- **Accesos directos**: al mantener presionado el ícono aparecen *Reportar*, *Cerca de mí* y *Emergencias*.
- **Ubicación**: el último paso del onboarding pide el permiso. Con el permiso concedido, el mapa se centra en el vecino, muestra cuántas alertas hay a menos de 1 km y el formulario de reporte arranca en su ubicación y distrito.
- **Cámara**: *Tomar foto* y *Grabar video* abren una cámara integrada (vista previa, cambio de cámara, videos de hasta 20 s). Si el navegador no da acceso, se puede elegir un archivo de la galería.
- **Service worker** (`frontend/public/sw.js`): solo se activa en la compilación de producción (o en desarrollo con `?sw=1`). Nunca guarda en caché respuestas privadas (sesión, perfil, evidencias, portal) ni mosaicos del mapa.

Para probar la instalación, compila la interfaz y ábrela desde FastAPI en http://127.0.0.1:8000 (ver *Ejecutar con un solo servidor*). En un celular, la cámara, la ubicación y la instalación exigen **HTTPS**; por la IP de la red local (`http://192.168…`) el navegador las bloquea. Para pruebas en el celular, usa un túnel HTTPS o despliega en un dominio con certificado.

## Arquitectura y conexión a Supabase

```text
React + TypeScript → FastAPI → PostgreSQL alojado en Supabase
```

La aplicación React consume rutas del mismo origen bajo `/api`. En desarrollo, Vite reenvía esas rutas a FastAPI. Para producción local o despliegue en un mismo origen, ejecuta `npm.cmd run build` en `frontend` antes de levantar FastAPI.

1. Crea un proyecto en Supabase. En **Connect**, copia la conexión de **Session pooler** si trabajas desde una red IPv4.
2. Copia `backend/.env.example` a `backend/.env`. En `DATABASE_URL`, cambia el prefijo `postgresql://` a `postgresql+psycopg://`. Usa la contraseña codificada para URL y configura SSL. Para verificar la identidad del servidor, usa `sslmode=verify-full` y el certificado raíz de tu proyecto con `sslrootcert`.
3. Con `APP_MODE=production` y desde `backend`, ejecuta `.\.venv\Scripts\python.exe -m app.manage init-db`. Se crea el esquema privado `alerta_trujillo`. Mantén ese esquema fuera de los esquemas expuestos por la Data API de Supabase.
4. Define `DOCUMENT_PEPPER` en `backend/.env` con un secreto largo y aleatorio. Se usa para guardar una huella del documento de identidad (evita cuentas duplicadas sin almacenar el número). No lo cambies después de registrar cuentas.
5. Crea las cuentas del equipo con `.\.venv\Scripts\python.exe -m app.manage create-moderator tu-correo@example.com "Nombre"` o `create-manager`. El comando pide la contraseña de forma interactiva. `init-db` también carga el directorio de contactos inicial; confirma el número de Serenazgo desde el portal antes de mostrarlo.
6. Sirve la aplicación por HTTPS en un mismo origen para que funcione la cookie de sesión segura. La credencial de PostgreSQL va únicamente en el entorno del backend.

[Conexión a PostgreSQL en Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

## API y Postman

Importa `postman/Alerta-Trujillo.postman_collection.json` y ejecuta la colección en orden contra la API local con los datos de demostración. La colección registra una cuenta de prueba distinta en cada ejecución, envía un reporte, verifica permisos, lo pasa por la lista de control, lo publica como «Sin verificar», comprueba qué información se hace pública y lo verifica. Postman conserva la cookie de sesión. Las solicitudes que cambian datos requieren el encabezado `X-Alerta-Client: 1`.

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

## Alcance de esta versión

Relación con los componentes del Sistema de Gestión del Conocimiento del informe (cap. XI):

| Componente | Estado | Dónde |
| --- | --- | --- |
| App de reporte y validación ciudadana | Implementado | App ciudadana |
| Portal corporativo | Implementado (roles moderación y gestión) | `#/portal` |
| Base de conocimiento | Implementado: taxonomía, responsable, suplente, versión, revisión por segunda persona, guías públicas | Portal → Conocimiento; app → Guías |
| Repositorio de evidencias | Parcial: fotos y videos privados por reporte, sin búsqueda transversal | Revisión |
| Dashboard gerencial | Implementado | Portal → Dashboard |
| Sistema de lecciones aprendidas | Implementado (problema, acción, resultado, límites, reporte de origen) | Portal → Conocimiento |
| Registro de reutilización (transferencia) | Implementado: guía aplicada en cada decisión y usos con observación | Revisión y Conocimiento |
| Plataforma de capacitación interna | Pendiente | — |
| Comunidades de práctica | Proceso del equipo (reunión semanal), sin módulo de software | — |

Pendiente antes de un piloto público: validación de correo, recuperación de cuenta, inicio de sesión con Google, límites de intentos y de envío, almacenamiento de evidencias en un servicio privado (por ejemplo Supabase Storage) en lugar del disco del servidor, migraciones de esquema, una política de conservación de datos y confirmar el directorio de contactos con cada entidad.
