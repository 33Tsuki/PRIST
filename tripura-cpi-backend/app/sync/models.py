from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SyncPriceRecord(BaseModel):
    client_id: str
    market_item_id: int
    previous_period_price: Decimal | None = Field(default=None, ge=0)
    current_period_price: Decimal | None = Field(default=None, ge=0)
    remark: str | None = Field(default=None, max_length=100)
    price_recording_date: date
    is_na: bool = False
    is_not_applicable: bool = False


class SyncRequest(BaseModel):
    round_id: int
    records: list[SyncPriceRecord] = Field(min_length=1)


class RecordResult(BaseModel):
    client_id: str
    status: Literal["created", "updated", "error"]
    price_data_id: int | None = None
    detail: str | None = None


class BatchSyncResponse(BaseModel):
    total: int
    succeeded: int
    failed: int
    results: list[RecordResult]


# ── Submission models ─────────────────────────────────────────────


class SubmissionRequest(BaseModel):
    round_id: int
    # Omitted = submit every assigned market at once (older app builds).
    market_id: int | None = None


class SubmissionResponse(BaseModel):
    round_id: int
    surveyor_id: int
    markets_submitted: int
    # Only populated when a single market was submitted.
    market_id: int | None = None
    status: str | None = None
    submitted_at: datetime | None = None


class MissingPriceItem(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    market_id: int
    market_code: str
    selected_market: str
    reason: Literal["missing_current_price"]


# ── Surveyor sync response models ────────────────────────────────


class SyncSurveyRound(BaseModel):
    round_id: int
    round_number: int
    round_name: str | None = None
    round_start_date: date
    round_end_date: date


class SyncSubstituteShop(BaseModel):
    item_price_collection_shop_setup_id: int
    shop_id: int
    shop_serial_no: str
    shop_name: str
    shop_description_and_location: str
    market_item_id: int | None = None
    market_item_description: str | None = None
    previous_period_price: Decimal | None = None
    stored_previous_period_price: Decimal | None = None
    current_period_price: Decimal | None = None
    is_na: bool = False
    is_not_applicable: bool = False
    remark: str | None = None


class SyncItem(BaseModel):
    item_price_collection_shop_setup_id: int
    item_id: int
    item_code: str
    item_name: str
    item_availability_code: str | None = None
    market_item_id: int | None = None
    market_item_description: str | None = None
    product_specification: str | None = None
    unit_of_sale: str | None = None
    previous_period_price: Decimal | None = None
    stored_previous_period_price: Decimal | None = None
    current_period_price: Decimal | None = None
    is_na: bool = False
    is_not_applicable: bool = False
    remark: str | None = None  # surveyor price-level remark (pd.remark)
    ds_remark: str | None = None  # DS item-level remark (setup.remark)
    substitute_shop_1: SyncSubstituteShop | None = None
    substitute_shop_2: SyncSubstituteShop | None = None


class SyncShop(BaseModel):
    shop_id: int
    shop_serial_no: str
    shop_name: str
    shop_phone_number: str | None = None
    shop_description_and_location: str
    general_description_of_items_sold: str | None = None
    items: list[SyncItem]


class SyncMarket(BaseModel):
    market_id: int
    market_code: str
    selected_market: str
    domain: str
    district_name: str
    district_code: str
    village_town: str | None = None
    address: str | None = None
    review_remark: str | None = None
    shops: list[SyncShop]


class SurveyorSyncResponse(BaseModel):
    survey_round: SyncSurveyRound | None = None
    markets: list[SyncMarket]
    message: str | None = None
