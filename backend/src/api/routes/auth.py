from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from src.common.errors import ConflictError, UnauthorizedError
from src.common.models import User
from src.config.db import get_db
from src.config.env import settings

limiter = Limiter(key_func=get_remote_address, enabled=(settings.ENVIRONMENT != "test"))
router = APIRouter(prefix="/api/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: Literal["CUSTOMER", "ADMIN"] = "CUSTOMER"


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    role: str
    createdAt: datetime | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserProfileResponse


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserProfileResponse,
)
@limiter.limit("20/minute")
async def register_user(
    request: Request,
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    # Check if email is already registered
    stmt = select(User).where(User.email == payload.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise ConflictError("Email already registered")

    new_user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserProfileResponse(
        id=new_user.id,
        name=new_user.name,
        email=new_user.email,
        role=new_user.role,
        createdAt=new_user.created_at,
    )


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    response_model=LoginResponse,
)
@limiter.limit("20/minute")
async def login_user(
    request: Request,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    stmt = select(User).where(User.email == payload.email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")

    token = create_access_token(
        data={"sub": user.id, "id": user.id, "email": user.email, "role": user.role}
    )

    return LoginResponse(
        token=token,
        user=UserProfileResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role,
            createdAt=user.created_at,
        ),
    )


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=UserProfileResponse,
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    return UserProfileResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
        createdAt=current_user.created_at,
    )
