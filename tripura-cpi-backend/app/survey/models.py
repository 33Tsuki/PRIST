from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.common.models import RoundCycle


class SurveyRoundCreate(BaseModel):
    # A round is always created in DRAFT; status moves via the start/end endpoints.
    # round_number is system-assigned (next in the cycle), not client-supplied.
    round_name: str | None = None
    cycle: RoundCycle = RoundCycle.MONTHLY
    round_start_date: date  # planned
    round_end_date: date  # planned


class SurveyRoundUpdate(BaseModel):
    # round_status / actual dates are managed only by the start/end endpoints.
    # round_number and cycle are fixed at creation (read-only).
    round_name: str | None = None
    round_start_date: date | None = None
    round_end_date: date | None = None


class SurveyRoundOut(BaseModel):
    round_id: int
    round_number: int
    round_name: str | None = None
    cycle: str
    round_status: str
    round_start_date: date
    round_end_date: date
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


class RoundMarketSummaryOut(BaseModel):
    market_id: int
    market_code: str
    selected_market: str
    domain: str
    district_id: int
    district_name: str
    subdivision_id: int | None = None
    subdivision: str | None = None
    # Derived from round lifecycle + survey status:
    # IN_PROGRESS | SUBMITTED | APPROVED | NOT_STARTED | INCOMPLETE
    status: str
    round_status: str  # DRAFT | ACTIVE | CLOSED
    setup_count: int
    total_count: int = 0  # ORIGINALLY SELECTED shop-item setups in the market
    collected_count: int = 0  # of those, ones with a price recorded / marked N/A
    alert_count: int = 0  # price records flagged with a price validation alert
    # Assignment + submission trail, so the dashboard can group by price collector and
    # show the review timeline without a per-market round trip.
    surveyor_id: int | None = None  # assigned PC (null if unassigned for this round)
    surveyor_name: str | None = None
    surveyor_phone: str | None = None
    submitted_at: datetime | None = None  # null until SUBMITTED
    submitted_by_name: str | None = None
    reviewed_at: datetime | None = None  # set on approve / un-submit


class PendingItemOut(BaseModel):
    """One (market, item) pair still awaiting a price. Carries the market's grouping
    dimensions so the dashboard can pivot by district / subdivision / domain / surveyor
    without a second lookup."""

    market_id: int
    market_code: str
    selected_market: str
    domain: str
    district_id: int
    district_name: str
    subdivision_id: int | None = None
    subdivision: str | None = None
    item_id: int
    item_code: str
    item_name: str
    surveyor_id: int | None = None
    surveyor_name: str | None = None


class RoundMarketSetupOut(BaseModel):
    setup_id: int
    shop_selection_status: str
    item_availability_code: str | None = None
    remark: str | None = None
    item_id: int
    item_code: str
    item_name: str
    shop_id: int
    shop_serial_no: str
    shop_name: str
    shop_description_and_location: str
    market_item_id: int | None = None
    unit_of_sale: str | None = None
    product_specification: str | None = None
    market_item_description: str | None = None


class SetupShopEntry(BaseModel):
    shop_id: int
    item_availability_code: str | None = None
    remark: str | None = None
    unit_of_sale: str | None = None
    product_specification: str | None = None
    market_item_description: str | None = None


def _ensure_distinct_shops(*entries: "SetupShopEntry | None"):
    """Reject duplicate shop_ids across the provided slots — the
    UNIQUE(item_id, shop_id, round_id) setup constraint forbids them."""
    shop_ids = [e.shop_id for e in entries if e is not None]
    if len(shop_ids) != len(set(shop_ids)):
        raise ValueError("Each shop may only be used once per item")


class SetupCreate(BaseModel):
    item_id: int
    round_id: int
    originally_selected: SetupShopEntry
    substitute_1: SetupShopEntry | None = None
    substitute_2: SetupShopEntry | None = None

    @model_validator(mode="after")
    def distinct_shops(self):
        _ensure_distinct_shops(
            self.originally_selected, self.substitute_1, self.substitute_2
        )
        return self


class SetupReplace(BaseModel):
    """Full replacement of an item's setup within a round + market (joined edit)."""

    originally_selected: SetupShopEntry
    substitute_1: SetupShopEntry | None = None
    substitute_2: SetupShopEntry | None = None

    @model_validator(mode="after")
    def distinct_shops(self):
        _ensure_distinct_shops(
            self.originally_selected, self.substitute_1, self.substitute_2
        )
        return self


class SetupUpdate(BaseModel):
    shop_selection_status: str | None = None
    item_availability_code: str | None = None
    remark: str | None = None
    unit_of_sale: str | None = None
    product_specification: str | None = None
    market_item_description: str | None = None

    @model_validator(mode="after")
    def ensure_any_field(self):
        if all(
            v is None
            for v in (
                self.shop_selection_status,
                self.item_availability_code,
                self.remark,
                self.unit_of_sale,
                self.product_specification,
                self.market_item_description,
            )
        ):
            raise ValueError("At least one field must be provided for update")
        return self


class AssignmentCreate(BaseModel):
    surveyor_id: int
    round_id: int
    market_id: int


class AssignmentUpdate(BaseModel):
    surveyor_id: int | None = None
    round_id: int | None = None
    market_id: int | None = None

    @model_validator(mode="after")
    def ensure_any_field(self):
        if (
            self.surveyor_id is None
            and self.round_id is None
            and self.market_id is None
        ):
            raise ValueError("At least one field must be provided for update")
        return self


class AssignmentOut(BaseModel):
    surveyor_assignment_id: int
    surveyor_id: int
    surveyor_name: str
    surveyor_phone: str
    round_id: int
    round_number: int
    round_name: str | None
    market_id: int
    market_name: str
    market_code: str
    created_at: datetime | None = None
    modified_at: datetime | None = None


class SurveyorMarketOut(BaseModel):
    surveyor_assignment_id: int
    surveyor_id: int
    round_id: int
    round_number: int
    round_name: str | None
    market_id: int
    market_name: str
    market_code: str
    domain: str
    district_name: str
    created_at: datetime | None = None
    modified_at: datetime | None = None


class SurveyorOut(BaseModel):
    surveyor_id: int
    username: str
    full_name: str
    phone: str
    is_active: bool
    district_id: int | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


class MarketLookupOut(BaseModel):
    market_id: int
    market_name: str
    market_code: str
    domain: str
    district_id: int
    district_name: str
    created_at: datetime | None = None
    modified_at: datetime | None = None


class RolloverResult(BaseModel):
    target_round_id: int
    source_round_id: int
    assignments_copied: int


class RolloverSetupsResult(BaseModel):
    target_round_id: int
    source_round_id: int
    setups_copied: int
    market_items_copied: int
    price_data_created: int


class PriceDataCreate(BaseModel):
    surveyor_id: int | None = None
    market_item_id: int
    current_period_price: Decimal | None = Field(default=None, ge=0)
    is_na: bool = False
    is_not_applicable: bool = False
    remark: str | None = None
    price_recording_date: date


class PriceDataOut(BaseModel):
    price_data_id: int
    market_item_id: int
    previous_period_price: Decimal | None = None
    current_period_price: Decimal | None = None
    remark: str | None = None
    price_recording_date: date | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None


class CollectedDataItemOut(BaseModel):
    setup_id: int
    item_id: int
    item_code: str
    item_name: str
    shop_id: int
    shop_serial_no: str
    shop_name: str
    shop_selection_status: str
    item_availability_code: str | None = None
    ds_remark: str | None = None  # DS item-level remark (setup.remark)
    market_item_id: int | None = None
    unit_of_sale: str | None = None
    product_specification: str | None = None
    market_item_description: str | None = None
    previous_period_price: Decimal | None = None
    current_period_price: Decimal | None = None
    is_na: bool | None = None
    is_not_applicable: bool | None = None
    price_recording_date: date | None = None
    price_remark: str | None = None
    price_change: Decimal | None = None
    price_change_percentage: Decimal | None = None
    price_alert: bool = False  # True when |price change| >= alert threshold


class CollectedDataSummary(BaseModel):
    total_items: int
    collected_count: int
    pending_count: int
    # Derived from round lifecycle + survey status:
    # IN_PROGRESS | SUBMITTED | APPROVED | NOT_STARTED | INCOMPLETE
    status: str
    round_status: str  # DRAFT | ACTIVE | CLOSED
    is_submitted: bool  # True once SUBMITTED or APPROVED (from raw survey status)
    alert_count: int = 0  # items flagged with a price validation alert
    submitted_at: datetime | None = None  # submission time (null until SUBMITTED)
    submitted_by: int | None = None  # PC user_id who submitted
    submitted_by_name: str | None = None  # PC full name
    surveyor_id: int | None = None  # currently assigned PC user_id (null if unassigned)
    surveyor_name: str | None = None
    surveyor_phone: str | None = None


class CollectedDataResponse(BaseModel):
    summary: CollectedDataSummary
    items: list[CollectedDataItemOut]


# ── Market survey status (per round+market approval workflow) ─────────────────


class MarketStatusOut(BaseModel):
    round_id: int
    market_id: int
    status: str
    submitted_at: datetime | None = None
    submitted_by: int | None = None
    reviewed_at: datetime | None = None
    reviewed_by: int | None = None
    review_remark: str | None = None


class UnsubmitRequest(BaseModel):
    review_remark: str | None = Field(default=None, max_length=500)


class SetupRemarkUpdate(BaseModel):
    """Set or clear the DS remark on one setup row. An empty string clears it."""

    remark: str | None = Field(default=None, max_length=500)
