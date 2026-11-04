from datetime import datetime

from pydantic import BaseModel

from app.common.models import UserRole


class AuditLogOut(BaseModel):
    audit_log_id: int
    user_id: int
    username: str | None = None
    user_role: UserRole
    action: str
    method: str
    path: str
    path_params: dict | None = None
    request_body: dict | list | None = None  # JSON root may be a list
    status_code: int
    created_at: datetime | None = None
