import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.db.session import engine
from app.api.v1.router import router
from app.core.config import settings

@asynccontextmanager
async def lifespan(app):
    from app.services.exam_worker import poll
    stop=asyncio.Event()
    worker=asyncio.create_task(poll(stop)) if settings.exam_sync_enabled else None
    try:
        yield
    finally:
        stop.set()
        if worker:
            await worker
        engine.dispose()

app = FastAPI(title=settings.application_name, version='0.2.0', lifespan=lifespan)
app.include_router(router, prefix='/api/v1')
FRONTEND_ROOT = Path(__file__).resolve().parents[2] / 'frontend'
if not FRONTEND_ROOT.is_dir():
    FRONTEND_ROOT = Path(__file__).resolve().parents[3] / 'frontend'
SERVE_FRONTEND = settings.serve_frontend and (FRONTEND_ROOT / 'index.html').is_file()
if SERVE_FRONTEND:
    app.mount('/assets', StaticFiles(directory=FRONTEND_ROOT / 'src'), name='assets')


@app.get('/app/', include_in_schema=False)
def student_interface():
    if SERVE_FRONTEND:
        return FileResponse(FRONTEND_ROOT / 'index.html', headers={'Cache-Control': 'no-cache'})
    return {'application': settings.application_name, 'service': 'api', 'docs': '/docs', 'health': '/health'}


@app.get('/', include_in_schema=False)
@app.get('/about/', include_in_schema=False)
@app.get('/privacy/', include_in_schema=False)
@app.get('/terms/', include_in_schema=False)
def public_information(request: Request):
    if request.url.path == '/' and not SERVE_FRONTEND:
        return {'application': settings.application_name, 'service': 'api', 'docs': '/docs', 'health': '/health'}
    slug = request.url.path.strip('/') or 'about'
    return FileResponse(FRONTEND_ROOT / 'public' / slug / 'index.html', headers={'Cache-Control': 'no-cache'})


@app.get('/halicx-extension.zip', include_in_schema=False)
def halicx_extension_download():
    return FileResponse(FRONTEND_ROOT / 'public' / 'halicx-extension.zip', filename='halicmind-halicx-extension.zip', media_type='application/zip')


@app.get('/legal.css', include_in_schema=False)
def public_information_styles():
    return FileResponse(FRONTEND_ROOT / 'public' / 'legal.css', media_type='text/css')


@app.get('/api/v1/ui-config', include_in_schema=False)
def ui_config():
    return {
        'application_name': settings.application_name,
        'microsoft_login_enabled': bool(settings.microsoft_client_id),
        'classroom_enabled': bool(settings.classroom_client_id),
        'data_controller_name': settings.data_controller_name,
        'privacy_contact_email': settings.privacy_contact_email,
        'local_mailbox': settings.mail_provider == 'smtp' and settings.smtp_host in {'127.0.0.1', 'localhost'} and settings.smtp_port == 1025,
        'verification_expire_minutes': settings.email_verification_expire_minutes,
    }


@app.middleware('http')
async def browser_headers(request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    if request.url.path in {'/', '/app/', '/about/', '/privacy/', '/terms/', '/legal.css'} or request.url.path.startswith('/assets/'):
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; "
            "frame-ancestors 'none'; form-action 'self'"
        )
        response.headers['Cache-Control'] = 'no-cache'
    if request.url.path.startswith('/api/v1/') and '/catalog/' not in request.url.path:
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    if request.url.path.startswith('/api/v1/auth/'):
        # Pydantic includes original inputs in errors by default. Passwords and
        # verification codes must not be echoed in validation responses.
        errors = [{key: value for key, value in error.items() if key not in {'input', 'ctx'}} for error in exc.errors()]
        return JSONResponse(status_code=422, content={'detail': jsonable_encoder(errors)})
    return await request_validation_exception_handler(request, exc)

@app.get('/health')
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1 FROM programs LIMIT 1'))
        return {'status': 'ok', 'database': 'postgresql'}
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail='Database unavailable')
