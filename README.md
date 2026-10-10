# Parapente — Backend SQLite3 + Frontend conectado a API

Este paquete contiene el backend y frontend modificados según tu solicitud:

1. **Backend** migrado de PostgreSQL a **SQLite3**
2. **Frontend** `main.js` reescrito para usar la API (en lugar de `localStorage`)

## Estructura
```
download/
├── parapente_backend/      # FastAPI + SQLite3
│   ├── app/
│   │   ├── database.py     # ← Motor SQLite3 configurado
│   │   ├── config.py       # ← DATABASE_URL apunta a parapente.db por defecto
│   │   ├── main.py         # (sin cambios)
│   │   ├── models.py       # (sin cambios)
│   │   ├── schemas.py      # (sin cambios)
│   │   ├── security.py     # (sin cambios)
│   │   └── create_admin.py # (sin cambios)
│   ├── requirements.txt    # ← psycopg eliminado
│   ├── .env.example        # ← URL SQLite
│   ├── .gitignore         # ← *.db excluido
│   └── README.md           # Actualizado
└── parapente_frontend/
    ├── index.html          # ← Añadido modal de login y auth bar
    ├── main.js              # ← Reescrito: API client + JWT + async CRUD
    └── styles.css          # ← Estilos para login/authbar
```

## Cómo correrlo

### 1. Backend
```bash
cd parapente_backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # opcional, hay defaults razonables
python -m app.create_admin    # crea la BD SQLite + admin + pilotos demo
uvicorn app.main:app --reload  # http://127.0.0.1:8000
```

La base de datos `parapente.db` se crea automáticamente en la raíz del backend.

### 2. Frontend
Sirve `parapente_frontend/` con cualquier servidor estático en `http://127.0.0.1:5500` (puerto configurado en el backend para CORS). Por ejemplo:
```bash
cd parapente_frontend
python3 -m http.server 5500
```

Abre `http://127.0.0.1:5500` y verás el modal de login. Credenciales por defecto:
- Usuario: `encargado`
- Contraseña: `CambiaEstaClave123!`

## Cambios principales

### Backend
- **`app/database.py`**: motor SQLite con `check_same_thread=False` (necesario para FastAPI), `StaticPool` para SQLite en memoria, creación automática del directorio padre del archivo `.db`.
- **`app/config.py`**: `DATABASE_URL` por defecto = `sqlite:///parapente.db` (relativa al directorio del backend).
- **`requirements.txt`**: quitado `psycopg[binary]` (SQLite viene con Python).
- Sigue siendo compatible con PostgreSQL: si vuelves a poner `DATABASE_URL=postgresql+psycopg://...`, funciona igual.

### Frontend (`main.js`)
- Se eliminó por completo el uso de `localStorage` como base de datos.
- Cliente `api()` central que añade automáticamente `Authorization: Bearer <jwt>` y maneja expiración.
- Login JWT con persistencia del token en `localStorage` (solo el token, no los datos).
- Modal de login + barra de sesión con botón de logout.
- `refreshAll()` inicial carga usuarios y pilotos en paralelo.
- Todas las operaciones (crear, asignar piloto, marcar vuelo, F/V, cobros, borrar) ahora llaman a la API.
- Botón "Reiniciar" ahora borra todos los participantes vía API (DELETE uno a uno).
- Mantiene el UX original (toasts, animaciones, mangifiesto, cola de despegue, indicador de viento, etc.).

## Notas
- El puerto del backend por defecto en `main.js` es `8000`. Si lo cambias, edita la constante `API_BASE` al inicio de `main.js`.
- El backend crea las tablas automáticamente al arrancar (`Base.metadata.create_all`). Para evolución del esquema, añade Alembic.
- Cambia las credenciales por defecto (`ADMIN_PASSWORD`, `SECRET_KEY`) antes de cualquier despliegue real.
