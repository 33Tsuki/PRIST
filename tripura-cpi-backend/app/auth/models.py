from datetime import datetime

from pydantic import BaseModel, Field

from app.common.models import UserRole

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AdminCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class AdminUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50)
    password: str | None = Field(default=None, min_length=8)


class SurveyorCreate(BaseModel):
    full_name: str = Field(max_length=150)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9][0-9]{9,14}$")
    email: str | None = Field(default=None, max_length=254, pattern=_EMAIL_PATTERN)
    district_id: int
    password: str = Field(min_length=6)
    is_active: bool = True


class SurveyorUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9][0-9]{9,14}$")
    email: str | None = Field(default=None, max_length=254, pattern=_EMAIL_PATTERN)
    password: str | None = Field(default=None, min_length=6)
    is_active: bool | None = None


class SupervisorCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(max_length=150)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9][0-9]{9,14}$")
    email: str | None = Field(default=None, max_length=254, pattern=_EMAIL_PATTERN)
    district_id: int
    password: str = Field(min_length=8)
    is_active: bool = True


# district_id is intentionally absent: a supervisor's district is set at creation
# and not reassignable (see the schema-redesign plan).
class SupervisorUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9][0-9]{9,14}$")
    email: str | None = Field(default=None, max_length=254, pattern=_EMAIL_PATTERN)
    password: str | None = Field(default=None, min_length=8)
    is_active: bool | None = None


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserOut(BaseModel):
    user_id: int
    username: str
    full_name: str
    phone: str
    email: str | None = None
    role: UserRole
    is_active: bool
    district_id: int | None = None
    district_name: str | None = None
    district_code: str | None = None
    created_at: datetime
    modified_at: datetime


class SurveyorPublicOut(BaseModel):
    user_id: int
    username: str
    full_name: str


class SupervisorMarketOut(BaseModel):
    market_id: int
    market_name: str
    market_code: str
    domain: str
    district_name: str


class SurveyorLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: int
    username: str
    full_name: str
    phone: str
    email: str | None = None
    district_id: int | None = None
    district_name: str | None = None
    district_code: str | None = None
    role: UserRole = UserRole.PRICE_COLLECTOR
