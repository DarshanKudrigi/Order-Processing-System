from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.errors import ForbiddenError, UnauthorizedError
from src.common.models import User
from src.config.db import get_db
from src.config.env import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def parse_duration(duration_str: str) -> timedelta:
    # Handles "8h", "30m", "1d"
    duration_str = duration_str.strip().lower()
    if duration_str.endswith("h"):
        return timedelta(hours=int(duration_str[:-1]))
    if duration_str.endswith("m"):
        return timedelta(minutes=int(duration_str[:-1]))
    if duration_str.endswith("d"):
        return timedelta(days=int(duration_str[:-1]))
    if duration_str.endswith("s"):
        return timedelta(seconds=int(duration_str[:-1]))
    return timedelta(hours=8)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + parse_duration(settings.JWT_EXPIRES_IN)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise UnauthorizedError("Missing, invalid or expired token")


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing, invalid or expired token")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    user_id = payload.get("sub") or payload.get("id")
    if not user_id:
        raise UnauthorizedError("Missing, invalid or expired token")

    stmt = select(User).where(User.id == str(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("Missing, invalid or expired token")

    return user


def require_roles(*allowed_roles: str):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenError("Role not allowed, or order belongs to another user")
        return current_user

    return role_checker


require_admin = require_roles("ADMIN")
require_user = require_roles("CUSTOMER", "ADMIN")

