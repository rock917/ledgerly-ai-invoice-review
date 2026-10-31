from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore")
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "ap-invoices"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    demo_access_token: str = ""
    review_access_token: str = ""
    max_upload_mb: int = 5
    max_pdf_pages: int = 5

    @property
    def missing_configuration(self) -> list[str]:
        names = ["supabase_url", "supabase_service_role_key", "groq_api_key", "demo_access_token", "review_access_token"]
        return [name.upper() for name in names if not getattr(self, name).strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
