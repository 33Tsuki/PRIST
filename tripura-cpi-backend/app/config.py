from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "tripura_cpi"
    app_env: str = "dev"
    allowed_origins: str = "*"
    jwt_secret_key: str = "change-me-in-production"
    access_token_expiry_minutes: int = 10
    refresh_token_expiry_days: int = 7
    log_dir: str = "logs"
    log_console_level: str = "INFO"
    log_file_level: str = "DEBUG"
    default_admin_password: str = "admin123"
    root_path: str = ""
    max_upload_mb: int = 50
    # Bulk (multi-file / zip) setup uploads
    max_bulk_files: int = (
        100  # max spreadsheets processed per request (direct + zip members)
    )
    max_bulk_file_mb: int = (
        10  # per-spreadsheet cap (raw upload or decompressed member)
    )
    max_zip_entries: int = 200  # entries scanned in one zip before filtering
    max_bulk_decompressed_mb: int = 200  # cumulative decompressed bytes across a zip
    max_compression_ratio: int = (
        200  # reject a member whose uncompressed/compressed ratio exceeds this
    )
    audit_max_body_bytes: int = 10_000
    price_alert_threshold_pct: int = 50
    reports_dir: str = "generated_reports"
    report_warn_rows: int = 5000  # above this, generation requires confirm=true
    report_max_rows: int = 20_000  # hard cap for pdf/docx (WeasyPrint memory bound)
    report_max_rows_xlsx: int = 100_000  # hard cap for xlsx
    report_max_concurrent_renders: int = 1  # per uvicorn worker
    rate_limit_default: str = "120/minute"
    rate_limit_auth: str = "120/minute"

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # .env is shared with docker-compose (PGADMIN_* etc.), so ignore keys
    # that aren't Settings fields instead of crashing at startup.
    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
