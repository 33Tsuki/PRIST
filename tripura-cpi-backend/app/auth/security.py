from datetime import UTC, datetime, timedelta

import anyio
from jose import jwt
from pwdlib import PasswordHash

from app.config import settings

_pwd_hash = PasswordHash.recommended()


async def hash_password(password: str) -> str:
    # Argon2 hashing is CPU-bound (tens–hundreds of ms); run it in a worker thread so a
    # burst of logins/user writes doesn't block the event loop for all other requests.
    return await anyio.to_thread.run_sync(_pwd_hash.hash, password)


async def verify_password(password: str, password_hash: str) -> bool:
    return await anyio.to_thread.run_sync(_pwd_hash.verify, password, password_hash)


def create_access_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": datetime.now(UTC)
        + timedelta(minutes=settings.access_token_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def create_refresh_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "refresh",
        "exp": datetime.now(UTC) + timedelta(days=settings.refresh_token_expiry_days),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
