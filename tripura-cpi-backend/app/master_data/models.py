from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.common.models import (
    CpiDomain,
    ItemBranding,
    ItemPackaging,
)


# --- Bulk Delete ---
class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1)


class BulkDeleteResult(BaseModel):
    id: int
    status: Literal["deleted", "not_found", "error"]
    detail: str | None = None


class BulkDeleteResponse(BaseModel):
    entity: str
    total: int
    deleted: int
    not_found: int
    errors: int
    results: list[BulkDeleteResult]


# --- Tehsil ---
class TehsilOut(BaseModel):
    tehsil_id: int
    name: str
    teh_mmdc: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- Subdivision ---
class SubdivisionOut(BaseModel):
    subdivision_id: int
    name: str
    lgd_code: int
    district_id: int
    district_name: str
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- District ---
class DistrictOut(BaseModel):
    district_id: int
    name: str
    code: str
    lgd_code: int | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- Market ---
class _MarketNormMixin:
    @field_validator("vill_town_mmdc", mode="before")
    @classmethod
    def _pad_vill_town_mmdc(cls, v):
        if v is not None:
            return str(v).strip().zfill(6)
        return v

    @field_validator("market_code", mode="before")
    @classmethod
    def _normalize_market_code(cls, v):
        if v is not None:
            return str(v).strip().upper()
        return v


class MarketCreate(_MarketNormMixin, BaseModel):
    domain: CpiDomain
    des_corrected: CpiDomain | None = None
    district_id: int
    vill_town_mmdc: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    tehsil_id: int | None = None
    village_town: str | None = None
    subdivision_id: int | None = None
    market_day: str | None = None
    market_time: str | None = None
    block_ulb_name: str | None = None
    block_lgd_code: int | None = Field(default=None, gt=0)
    dso_office: str | None = None
    selected_market: str
    market_code: str = Field(pattern=r"^(RN|RT|UO)\d{4}$")
    address: str | None = None
    notes: str | None = None


class MarketUpdate(_MarketNormMixin, BaseModel):
    domain: CpiDomain | None = None
    des_corrected: CpiDomain | None = None
    district_id: int | None = None
    vill_town_mmdc: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    tehsil_id: int | None = None
    village_town: str | None = None
    subdivision_id: int | None = None
    market_day: str | None = None
    market_time: str | None = None
    block_ulb_name: str | None = None
    block_lgd_code: int | None = Field(default=None, gt=0)
    dso_office: str | None = None
    selected_market: str | None = None
    market_code: str | None = Field(default=None, pattern=r"^(RN|RT|UO)\d{4}$")
    address: str | None = None
    notes: str | None = None


class MarketOut(BaseModel):
    market_id: int
    domain: str
    des_corrected: str | None = None
    district_id: int
    district_name: str
    district_code: str
    vill_town_mmdc: str | None = None
    tehsil_id: int | None = None
    tehsil: str | None = None
    teh_mmdc: str | None = None
    village_town: str | None = None
    subdivision_id: int | None = None
    subdivision: str | None = None
    subdivision_lgd_code: int | None = None
    market_day: str | None = None
    market_time: str | None = None
    block_ulb_name: str | None = None
    block_lgd_code: int | None = None
    dso_office: str | None = None
    selected_market: str
    market_code: str
    address: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- Shop ---
class _ShopNormMixin:
    @field_validator("shop_serial_no", mode="before")
    @classmethod
    def _normalize_shop_serial_no(cls, v):
        if v is not None:
            return str(v).strip().upper()
        return v


class ShopCreate(_ShopNormMixin, BaseModel):
    shop_serial_no: str = Field(pattern=r"^[0-9]+[A-Z]$")
    shop_name: str
    shop_phone_number: str | None = Field(default=None, pattern=r"^[6-9][0-9]{9}$")
    shop_description_and_location: str
    general_description_of_items_sold: str | None = None
    notes: str | None = None


class ShopUpdate(_ShopNormMixin, BaseModel):
    shop_serial_no: str | None = Field(default=None, pattern=r"^[0-9]+[A-Z]$")
    shop_name: str | None = None
    shop_phone_number: str | None = Field(default=None, pattern=r"^[6-9][0-9]{9}$")
    shop_description_and_location: str | None = None
    general_description_of_items_sold: str | None = None
    notes: str | None = None


class ShopOut(BaseModel):
    shop_id: int
    shop_serial_no: str
    shop_name: str
    shop_phone_number: str | None = None
    shop_description_and_location: str
    general_description_of_items_sold: str | None = None
    market_id: int
    selected_market: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- Item ---
class ItemCreate(BaseModel):
    item_code: str = Field(pattern=r"^[0-9]{4}$")
    item_name: str
    notes: str | None = None


class ItemUpdate(BaseModel):
    item_code: str | None = Field(default=None, pattern=r"^[0-9]{4}$")
    item_name: str | None = None
    notes: str | None = None


class ItemOut(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    notes: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


# --- Market Item ---
class MarketItemCreate(BaseModel):
    shop_id: int
    item_id: int
    round_id: int
    market_item_description: str | None = None
    item_branding: ItemBranding | None = None
    item_packaging: ItemPackaging | None = None
    package_size_value: Decimal | None = Field(default=None, gt=0)
    package_size_unit: str | None = Field(
        default=None, pattern=r"^(kg|gm|ltr|ml|piece|pieces|box)$"
    )
    item_variety: str | None = None
    unit_of_sale: str
    product_specification: str | None = None
    notes: str | None = None


class MarketItemUpdate(BaseModel):
    item_id: int | None = None
    round_id: int | None = None
    market_item_description: str | None = None
    item_branding: ItemBranding | None = None
    item_packaging: ItemPackaging | None = None
    package_size_value: Decimal | None = Field(default=None, gt=0)
    package_size_unit: str | None = Field(
        default=None, pattern=r"^(kg|gm|ltr|ml|piece|pieces|box)$"
    )
    item_variety: str | None = None
    unit_of_sale: str | None = None
    product_specification: str | None = None
    notes: str | None = None


class MarketItemOut(BaseModel):
    market_item_id: int
    item_id: int
    shop_id: int
    round_id: int
    market_item_description: str | None = None
    item_branding: str | None = None
    item_packaging: str | None = None
    package_size_value: Decimal | None = None
    package_size_unit: str | None = None
    item_variety: str | None = None
    unit_of_sale: str
    product_specification: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None
