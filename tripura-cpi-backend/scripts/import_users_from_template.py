#!/usr/bin/env python3
"""Import DS and surveyor users from user_management_template.xlsx.

Dry run by default:
    python scripts/import_users_from_template.py

Apply inserts:
    python scripts/import_users_from_template.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = REPO_ROOT / "user_management_template.xlsx"
TITLE_TOKENS = {"shri", "sri", "smt", "mr", "mrs", "ms", "dr"}
DISTRICT_ALIASES = {
    "west": "West Tripura",
    "west tripura": "West Tripura",
    "sipahijala": "Sepahijala",
    "sepahijala": "Sepahijala",
    "khowai": "Khowai",
    "dhalai": "Dhalai",
    "unakoti": "Unakoti",
    "north": "North Tripura",
    "north tripura": "North Tripura",
    "gomati": "Gomati",
    "south": "South Tripura",
    "south tripura": "South Tripura",
}


@dataclass(frozen=True)
class District:
    district_id: int
    name: str
    code: str


@dataclass(frozen=True)
class ImportUser:
    role: str
    source_sheet: str
    source_row: int
    full_name: str
    district_name: str
    district_id: int
    district_code: str
    email: str | None
    phone: str | None
    username: str | None
    password: str


@dataclass(frozen=True)
class ExistingUser:
    user_id: int
    role: str
    username: str
    full_name: str | None
    phone: str | None
    district_id: int | None


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key.removeprefix("export ").strip()
        value = value.strip().strip("'\"")
        if key:
            os.environ.setdefault(key, value)


def load_server_env() -> None:
    load_env_file(Path("/etc/api.env"))
    load_env_file(REPO_ROOT / ".env")


def normalized_key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def clean_text(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return text or None


def clean_name(value: Any) -> str:
    name = clean_text(value)
    if not name:
        return ""
    return name.rstrip(" ,")


def canonical_district(value: Any) -> str | None:
    return DISTRICT_ALIASES.get(normalized_key(value))


def first_personal_name(full_name: str) -> str:
    words = re.findall(r"[A-Za-z]+", full_name)
    for word in words:
        if word.lower() not in TITLE_TOKENS:
            return word.title()
    raise ValueError(f"Could not derive first name from {full_name!r}")


def supervisor_username(full_name: str, district_code: str) -> str:
    first = first_personal_name(full_name).lower()
    first = re.sub(r"[^a-z0-9]+", "", first)
    if not first:
        raise ValueError(f"Could not derive username from {full_name!r}")
    return f"{first}.{district_code}"


def generated_password(full_name: str, district_code: str) -> str:
    return f"{first_personal_name(full_name)}@{district_code}"


def normalize_email(value: Any) -> str | None:
    email = clean_text(value)
    if not email:
        return None
    email = email.strip().lower()
    if not re.fullmatch(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ValueError(f"Invalid email {email!r}")
    return email


def normalize_phone(value: Any) -> str | None:
    phone = clean_text(value)
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise ValueError(f"Invalid Indian mobile number {phone!r}")
    return f"+91{digits}"


def header_map(row: tuple[Any, ...]) -> dict[str, int]:
    headers: dict[str, int] = {}
    for index, value in enumerate(row):
        key = normalized_key(value)
        if key:
            headers[key] = index
    return headers


def get_cell(row: tuple[Any, ...], headers: dict[str, int], *names: str) -> Any:
    for name in names:
        index = headers.get(normalized_key(name))
        if index is not None and index < len(row):
            return row[index]
    return None


def parse_workbook(
    path: Path, districts_by_name: dict[str, District]
) -> list[ImportUser]:
    if not path.exists():
        raise ValueError(f"Workbook not found: {path}")

    workbook = load_workbook(path, read_only=True, data_only=True)
    users: list[ImportUser] = []
    errors: list[str] = []

    for worksheet in workbook.worksheets:
        sheet_name = worksheet.title.strip()
        sheet_key = normalized_key(sheet_name)
        if sheet_key not in {"surveyor_template", "supervisor_template"}:
            continue

        rows = worksheet.iter_rows(values_only=True)
        try:
            headers = header_map(next(rows))
        except StopIteration:
            continue

        role = (
            "PRICE_COLLECTOR"
            if sheet_key == "surveyor_template"
            else "DISTRICT_SUPERVISOR"
        )

        for row_number, row in enumerate(rows, start=2):
            if not any(clean_text(value) for value in row):
                continue

            try:
                full_name = clean_name(
                    get_cell(row, headers, "Full Name", "Full Name ")
                )
                if not full_name:
                    raise ValueError("Full name is required")

                district_name = canonical_district(
                    get_cell(row, headers, "District", "District ")
                )
                if not district_name:
                    raw_district = get_cell(row, headers, "District", "District ")
                    raise ValueError(f"Unknown district {raw_district!r}")

                district = districts_by_name.get(district_name)
                if not district:
                    raise ValueError(
                        f"District {district_name!r} is not present in the database"
                    )

                email = normalize_email(get_cell(row, headers, "Email(optional)"))
                phone = (
                    normalize_phone(get_cell(row, headers, "Phone Number(optional)"))
                    if role == "PRICE_COLLECTOR"
                    else None
                )
                username = (
                    supervisor_username(full_name, district.code)
                    if role == "DISTRICT_SUPERVISOR"
                    else None
                )
                users.append(
                    ImportUser(
                        role=role,
                        source_sheet=sheet_name,
                        source_row=row_number,
                        full_name=full_name,
                        district_name=district.name,
                        district_id=district.district_id,
                        district_code=district.code,
                        email=email,
                        phone=phone,
                        username=username,
                        password=generated_password(full_name, district.code),
                    )
                )
            except ValueError as exc:
                errors.append(f"{sheet_name} row {row_number}: {exc}")

    if errors:
        raise ValueError("Workbook validation failed:\n" + "\n".join(errors))
    if not users:
        raise ValueError("No importable users found in workbook")
    return users


async def fetch_districts(conn: Any) -> dict[str, District]:
    cur = await conn.execute(
        """
        SELECT district_id, name, code
        FROM cpi_tripura_district
        ORDER BY district_id
        """
    )
    rows = await cur.fetchall()
    return {
        row["name"]: District(row["district_id"], row["name"], row["code"])
        for row in rows
    }


async def fetch_existing_users(conn: Any) -> list[ExistingUser]:
    cur = await conn.execute(
        """
        SELECT user_id, user_role AS role, username, full_name, phone, district_id
        FROM cpi_tripura_user
        """
    )
    rows = await cur.fetchall()
    return [
        ExistingUser(
            user_id=row["user_id"],
            role=row["role"],
            username=row["username"],
            full_name=row["full_name"],
            phone=row["phone"],
            district_id=row["district_id"],
        )
        for row in rows
    ]


def validate_import_batch(
    users: list[ImportUser], existing_users: list[ExistingUser]
) -> tuple[list[ImportUser], list[tuple[ImportUser, str]]]:
    errors: list[str] = []
    skips: list[tuple[ImportUser, str]] = []
    creates: list[ImportUser] = []

    existing_by_username = {user.username: user for user in existing_users}
    existing_by_phone = {
        user.phone: user for user in existing_users if user.phone is not None
    }
    pc_identity = {
        (normalized_key(user.full_name), user.district_id): user
        for user in existing_users
        if user.role == "PRICE_COLLECTOR" and user.full_name
    }
    seen_usernames: set[str] = set()
    seen_phones: set[str] = set()

    for user in users:
        location = f"{user.source_sheet} row {user.source_row}"
        if user.username:
            if user.username in seen_usernames:
                errors.append(
                    f"{location}: duplicate generated username {user.username}"
                )
                continue
            seen_usernames.add(user.username)

        if user.phone:
            if user.phone in seen_phones:
                errors.append(f"{location}: duplicate phone in workbook {user.phone}")
                continue
            seen_phones.add(user.phone)

        if user.role == "DISTRICT_SUPERVISOR":
            assert user.username is not None
            existing = existing_by_username.get(user.username)
            if existing:
                if existing.role != "DISTRICT_SUPERVISOR":
                    errors.append(
                        f"{location}: username {user.username} belongs to {existing.role}"
                    )
                else:
                    skips.append((user, f"existing username {user.username}"))
                continue
            creates.append(user)
            continue

        if user.phone:
            existing = existing_by_phone.get(user.phone)
            if existing:
                if existing.role != "PRICE_COLLECTOR":
                    errors.append(
                        f"{location}: phone {user.phone} belongs to {existing.role}"
                    )
                else:
                    skips.append((user, f"existing phone {user.phone}"))
                continue

        existing = pc_identity.get((normalized_key(user.full_name), user.district_id))
        if existing:
            skips.append((user, f"existing surveyor {existing.username}"))
            continue

        creates.append(user)

    if errors:
        raise ValueError("Import validation failed:\n" + "\n".join(errors))
    return creates, skips


async def insert_supervisor(conn: Any, user: ImportUser, password_hash: str) -> str:
    assert user.username is not None
    await conn.execute(
        """
        INSERT INTO cpi_tripura_user
            (user_role, username, full_name, email, is_active, district_id, password_hash)
        VALUES
            ('DISTRICT_SUPERVISOR', %s, %s, %s, TRUE, %s, %s)
        """,
        [
            user.username,
            user.full_name,
            user.email,
            user.district_id,
            password_hash,
        ],
    )
    return user.username


async def insert_surveyor(conn: Any, user: ImportUser, password_hash: str) -> str:
    cur = await conn.execute(
        """
        WITH d AS (
            UPDATE cpi_tripura_district
            SET next_surveyor_seq = next_surveyor_seq + 1
            WHERE district_id = %s
            RETURNING district_id, code, next_surveyor_seq - 1 AS seq
        )
        INSERT INTO cpi_tripura_user
            (user_role, username, full_name, phone, email, is_active, district_id, password_hash)
        SELECT 'PRICE_COLLECTOR',
               'PC.' || d.code || '.' || LPAD(d.seq::text, 3, '0'),
               %s, %s, %s, TRUE, d.district_id, %s
        FROM d
        RETURNING username
        """,
        [
            user.district_id,
            user.full_name,
            user.phone,
            user.email,
            password_hash,
        ],
    )
    row = await cur.fetchone()
    if not row:
        raise RuntimeError(f"District disappeared while inserting {user.full_name}")
    return row["username"]


def print_rows(
    title: str,
    rows: list[tuple[ImportUser, str]],
    show_passwords: bool,
) -> None:
    if not rows:
        return
    print(f"\n{title}:")  # noqa: T201
    for user, detail in rows:
        password = f" password={user.password}" if show_passwords else ""
        print(  # noqa: T201
            f"  - {user.role} {detail}: {user.full_name} "
            f"({user.district_name}){password}"
        )


async def run(args: argparse.Namespace) -> int:
    load_server_env()
    sys.path.insert(0, str(REPO_ROOT))

    import psycopg
    from psycopg.rows import dict_row

    from app.auth.security import hash_password
    from app.config import settings

    async with await psycopg.AsyncConnection.connect(
        settings.database_url, row_factory=dict_row
    ) as conn:
        districts = await fetch_districts(conn)
        users = parse_workbook(args.workbook, districts)
        existing_users = await fetch_existing_users(conn)
        creates, skips = validate_import_batch(users, existing_users)

        print(  # noqa: T201
            f"Validated {len(users)} workbook users: "
            f"{len(creates)} to create, {len(skips)} to skip."
        )
        print_rows("Skipped", skips, args.show_passwords)

        created: list[tuple[ImportUser, str]] = []
        if args.apply:
            async with conn.transaction():
                for user in creates:
                    password_hash = await hash_password(user.password)
                    if user.role == "DISTRICT_SUPERVISOR":
                        username = await insert_supervisor(conn, user, password_hash)
                    else:
                        username = await insert_surveyor(conn, user, password_hash)
                    created.append((user, username))
            print_rows("Created", created, args.show_passwords)
        else:
            planned = [
                (
                    user,
                    user.username
                    if user.role == "DISTRICT_SUPERVISOR"
                    else f"PC.{user.district_code}.###",
                )
                for user in creates
            ]
            print_rows("Would create", planned, args.show_passwords)
            print(  # noqa: T201
                "\nDry run only. Re-run with --apply to insert users."
            )

        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import users from user_management_template.xlsx"
    )
    parser.add_argument(
        "workbook",
        nargs="?",
        type=Path,
        default=DEFAULT_WORKBOOK,
        help=f"Workbook path, default: {DEFAULT_WORKBOOK}",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Insert missing users. Default is validation/dry-run only.",
    )
    parser.add_argument(
        "--show-passwords",
        action="store_true",
        help="Print generated plain-text passwords in the summary.",
    )
    return parser.parse_args()


def main() -> int:
    try:
        return asyncio.run(run(parse_args()))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)  # noqa: T201
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
