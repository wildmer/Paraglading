# Backend de gestión de parapente — FastAPI + SQLite

Backend basado en el `main.js` del frontend. Incluye usuarios, pilotos, estado de vuelo, servicio de foto/vídeo, registro de pagos y autenticación JWT para operaciones de encargado.

> Backend funcional de partida, no una garantía de producción lista sin pruebas. Antes de usar datos reales, configura secretos, HTTPS, backups y revisa las reglas de negocio.

## Requisitos
- Python 3.11+
- **SQLite 3** (incluido en la librería estándar de Python — no requiere instalación adicional)

## Instalación local

```bash
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
```

Edita `.env` si quieres cambiar la ruta de la base de datos SQLite, el `SECRET_KEY` y las credenciales iniciales del encargado.

Ejemplo de URL SQLite (relativa al directorio del backend):
```env
DATABASE_URL=sqlite:///parapente.db
```
Y absoluta:
```env
DATABASE_URL=sqlite:////var/lib/parapente/parapente.db
```

Crea el admin inicial y los pilotos de demostración, luego arranca el servidor:

```bash
python -m app.create_admin
uvicorn app.main:app --reload
```

Abre `http://127.0.0.1:8000/docs` para explorar y probar la API. La base de datos SQLite (`parapente.db`) se crea automáticamente en el directorio del backend la primera vez que arranca la app.

## Migración desde PostgreSQL
Si vienes de la versión PostgreSQL:
1. Reemplaza `DATABASE_URL` en `.env` por `sqlite:///parapente.db` (o la ruta absoluta que prefieras).
2. (Opcional) Quita `psycopg` de `requirements.txt` — ya no es necesario.
3. Ejecuta `python -m app.create_admin` para crear tablas y admin.

## Autenticación
- `POST /api/auth/login` recibe `username` y `password`, devuelve un token JWT.
- Los endpoints de administración requieren `Authorization: Bearer <access_token>`.
- `POST /api/usuarios` es público para permitir registro de participantes.
- En producción, cambia las credenciales iniciales y usa HTTPS. No pongas `SECRET_KEY` ni credenciales administrativas en JavaScript.

## Endpoints principales

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión de encargado |
| GET | `/api/health` | Comprobar servicio |
| POST | `/api/usuarios` | Registrar participante (público) |
| GET | `/api/usuarios` | Listar participantes (encargado) |
| GET | `/api/usuarios/{id}` | Obtener participante |
| PATCH | `/api/usuarios/{id}` | Editar datos básicos |
| DELETE | `/api/usuarios/{id}` | Eliminar participante |
| GET/POST | `/api/pilotos` | Listar / crear pilotos |
| PATCH | `/api/usuarios/{id}/piloto` | Asignar piloto (`?piloto_id=` o sin parámetro para desasignar) |
| PATCH | `/api/usuarios/{id}/vuelo` | Marcar/deshacer vuelo (`?volado=true\|false`) |
| PUT | `/api/usuarios/{id}/foto-video` | Crear o editar servicio |
| DELETE | `/api/usuarios/{id}/foto-video` | Retirar servicio |
| PATCH | `/api/usuarios/{id}/foto-video/pago` | Registrar/anular pago |
| GET | `/api/resumen` | Resumen para el panel |

Los listados de usuarios aceptan `orden=asc|desc`, `estado=todos|tierra|volado`, `q=texto`, `skip` y `limit`.

## Ejemplos

Login:
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"encargado","password":"CambiaEstaClave123!"}'
```

Registro público:
```bash
curl -X POST http://127.0.0.1:8000/api/usuarios \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Ana Pérez","correo":"ana@example.com","tel":"3001234567","peso":65}'
```

Para endpoints protegidos, copia `access_token` de la respuesta de login y envíalo como Bearer token.

## Notas sobre SQLite
- SQLite es suficiente para uso local y para una sola operadora simultánea. Para múltiples operadoras en paralelo o despliegues en producción con mucha concurrencia, considera PostgreSQL.
- El archivo `parapente.db` se crea en la primera ejecución. Se puede borrar y recrear con `python -m app.create_admin` cuando quieras reiniciar los datos.
- Los `DateTime(timezone=True)` se almacenan como texto ISO 8601 en SQLite; SQLAlchemy los sigue exponiendo como `datetime` consciente de zona horaria.

## Limitaciones conocidas / siguientes pasos
- Se crean tablas al iniciar para facilitar la primera prueba. Para evolución seria del esquema, añade Alembic y migraciones versionadas.
- Un servicio de foto/vídeo se modela como máximo uno por participante, coincidiendo con el `fv` del frontend.
- `medio` y `valor` se guardan incluso si el pago está pendiente; `paid` refleja si el pago fue registrado.
- El registro público no requiere login, pero el acceso al manifiesto y la modificación de datos sí.
