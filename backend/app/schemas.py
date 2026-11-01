from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str
    quote: str
    page: int


class LineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str
    quantity: str | None
    unit_price: str | None
    amount: str | None


class Invoice(BaseModel):
    """All fields required by the JSON schema; unknown values must be explicit nulls."""
    model_config = ConfigDict(extra="forbid")
    vendor_name: str | None
    vendor_tax_id: str | None
    invoice_number: str | None
    invoice_date: str | None
    po_reference: str | None
    currency: str | None
    subtotal: str | None
    tax: str | None
    total: str | None
    line_items: list[LineItem]
    evidence: list[Evidence]
    uncertainties: list[str]

    @field_validator("vendor_name", "vendor_tax_id", "invoice_number", "invoice_date", "po_reference", "currency", mode="before")
    @classmethod
    def normalize_missing(cls, value):
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned.upper() in {"", "N/A", "NA", "NONE", "NULL", "NOT PROVIDED", "MISSING", "UNKNOWN"}:
                return None
            return cleaned
        return value

    @field_validator("subtotal", "tax", "total")
    @classmethod
    def valid_decimal(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            number = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("Amount must be a plain decimal string") from exc
        if not number.is_finite() or abs(number) > Decimal("1000000000"):
            raise ValueError("Amount outside supported range")
        if number.as_tuple().exponent < -2:
            raise ValueError("Amounts support at most two decimal places")
        return str(number)


class RuleResult(BaseModel):
    code: str
    status: Literal["pass", "review", "block"]
    title: str
    detected: str
    rule: str
    next_action: str


class Decision(BaseModel):
    outcome: Literal["ready", "needs_review", "blocked"]
    summary: str
    rules: list[RuleResult]
    po_id: str | None


class ReviewRequest(BaseModel):
    action: Literal["approve", "reject", "request_info"]
    comment: str = Field(min_length=5, max_length=2000)
    reviewer: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("comment", "reviewer")
    @classmethod
    def nonblank(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        minimum = 5 if info.field_name == "comment" else 2
        if len(value.strip()) < minimum:
            raise ValueError("Must contain meaningful text")
        return value.strip()
