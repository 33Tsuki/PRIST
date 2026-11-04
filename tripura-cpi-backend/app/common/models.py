from enum import StrEnum

from pydantic import BaseModel, Field


class _CaseInsensitiveMixin(StrEnum):
    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            lower = value.strip().lower()
            for member in cls:
                if member.value.lower() == lower:
                    return member
        return None


class CpiDomain(_CaseInsensitiveMixin):
    RURAL_NON_TRIBAL = "Rural Non Tribal"
    RURAL_TRIBAL = "Rural Tribal"
    URBAN = "Urban"


class ShopSelectionStatus(StrEnum):
    SUBSTITUTE_1 = "SUBSTITUTE 1"
    SUBSTITUTE_2 = "SUBSTITUTE 2"
    ORIGINALLY_SELECTED = "ORIGINALLY SELECTED"
    NOT_SELECTED = "NOT SELECTED"


class ItemAvailabilityCode(StrEnum):
    SEASONAL = "SEASONAL"
    PERENNIAL = "PERENNIAL"
    ABSENT = "ABSENT"


class ItemBranding(StrEnum):
    BRANDED = "BRANDED"
    NOT_BRANDED = "NOT BRANDED"


class ItemPackaging(StrEnum):
    PACKAGED = "PACKAGED"
    LOOSE = "LOOSE"


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    DISTRICT_SUPERVISOR = "DISTRICT_SUPERVISOR"
    PRICE_COLLECTOR = "PRICE_COLLECTOR"


class MarketSurveyStatus(StrEnum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"


class RoundStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class RoundCycle(StrEnum):
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    YEARLY = "YEARLY"


class PaginationParams(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=1000, ge=1, le=10000)


class ErrorResponse(BaseModel):
    detail: str
