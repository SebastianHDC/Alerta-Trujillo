from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .catalog import CATEGORIES, DISTRICTS, KNOWLEDGE_CATEGORIES, KNOWLEDGE_KINDS, REVIEW_CHECKLIST
from .database import DEMO
from .routes import auth, citizen, staff


def check_api_request(request: Request):
    # A separate origin cannot set this header without a successful CORS preflight.
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("X-Alerta-Client") != "1":
        raise HTTPException(403, "Falta el encabezado X-Alerta-Client.")


app = FastAPI(title="Alerta Trujillo", version="0.2.0")
api = APIRouter(prefix="/api", dependencies=[Depends(check_api_request)])


@app.exception_handler(RequestValidationError)
def validation_error(_request: Request, error: RequestValidationError):
    # Never echo submitted values, especially credentials, in validation errors.
    errors = error.errors()
    first = errors[0] if errors else None
    detail = "Revisa los campos del formulario."
    if first and first["type"] == "value_error" and first["loc"] == ("body",):
        detail = str(first["ctx"]["error"]).removeprefix("Value error, ")
    return JSONResponse({"detail": detail}, status_code=422)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@api.get("/health")
def health():
    return {"status": "ok", "mode": "demo" if DEMO else "production"}


@api.get("/catalog")
def catalog():
    return {
        "categories": CATEGORIES, "districts": DISTRICTS, "demo": DEMO,
        "knowledge_categories": KNOWLEDGE_CATEGORIES, "knowledge_kinds": KNOWLEDGE_KINDS, "checklist": REVIEW_CHECKLIST,
    }


api.include_router(auth.router)
api.include_router(citizen.router)
api.include_router(staff.router)
app.include_router(api)
dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
