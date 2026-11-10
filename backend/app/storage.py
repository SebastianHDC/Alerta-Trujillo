"""Almacenamiento privado de evidencias y adjuntos.

- Local (desarrollo): carpeta `UPLOADS` del servidor.
- Supabase Storage (producción y Vercel): bucket privado, accedido solo por el backend con la
  clave de servicio. Se activa al definir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException
from fastapi.responses import Response

from .database import SERVERLESS, UPLOADS

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
BUCKET = os.getenv("STORAGE_BUCKET") or "alerta-trujillo"
REMOTE = bool(SUPABASE_URL and SERVICE_KEY)


def _request(method: str, path: str, data: bytes | None = None, content_type: str | None = None):
    headers = {"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY}
    if content_type:
        headers["Content-Type"] = content_type
    if method == "POST":
        headers["x-upsert"] = "true"
    request = urllib.request.Request(f"{SUPABASE_URL}/storage/v1/{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code in (400, 404) and method == "GET":
            raise HTTPException(404, "No se encontró el archivo.")
        raise HTTPException(502, "El almacenamiento de archivos no respondió. Inténtalo de nuevo.")
    except urllib.error.URLError:
        raise HTTPException(502, "No se pudo conectar con el almacenamiento de archivos.")


def _object(name: str) -> str:
    return f"object/{BUCKET}/{urllib.parse.quote(name)}"


def save(name: str, data: bytes, content_type: str) -> None:
    if REMOTE:
        _request("POST", _object(name), data, content_type)
        return
    if SERVERLESS:
        # En Vercel el disco es efímero: sin Supabase Storage los archivos se perderían.
        raise HTTPException(503, "El almacenamiento de archivos no está configurado en este despliegue.")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    (UPLOADS / name).write_bytes(data)


def read(name: str) -> bytes:
    if REMOTE:
        return _request("GET", _object(name))
    path = UPLOADS / name
    if not path.is_file():
        raise HTTPException(404, "No se encontró el archivo.")
    return path.read_bytes()


def delete(name: str) -> None:
    if REMOTE:
        try:
            _request("DELETE", f"object/{BUCKET}", json.dumps({"prefixes": [name]}).encode(), "application/json")
        except HTTPException:
            pass  # Un archivo huérfano no debe impedir reemplazar el adjunto.
        return
    (UPLOADS / name).unlink(missing_ok=True)


def response(name: str, content_type: str, filename: str | None = None, private: bool = False) -> Response:
    headers = {"Cache-Control": "private, no-store" if private else "public, max-age=300"}
    if filename:
        safe = urllib.parse.quote(filename)
        headers["Content-Disposition"] = f"inline; filename*=UTF-8''{safe}"
    return Response(read(name), media_type=content_type, headers=headers)
