"""Punto de entrada de la API en Vercel: expone la aplicación FastAPI del backend.

vercel.json reescribe /api/<ruta> hacia esta función como /api/index?__route=<ruta>. Según el modo
de Vercel, la función recibe la ruta original o la reescrita; el middleware restaura la original
en el segundo caso para que FastAPI encuentre siempre /api/<ruta>.
"""
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402

REWRITE_PARAM = "__route"


class RestoreVercelPath:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") in ("/api/index", "/api/index.py"):
            params = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
            route = next((value for key, value in params if key == REWRITE_PARAM), None)
            if route is not None:
                path = "/api/" + route.lstrip("/")
                rest = [(key, value) for key, value in params if key != REWRITE_PARAM]
                scope = dict(scope, path=path, raw_path=path.encode(), query_string=urlencode(rest).encode())
        await self.inner(scope, receive, send)


app.add_middleware(RestoreVercelPath)
