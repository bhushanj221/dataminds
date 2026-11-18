from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    ENCRYPTION_KEY: str

    # AI / LLM — platform default (customers use this unless they bring their own)
    LLM_PROVIDER: str = "anthropic"        # anthropic | openai | ollama
    LLM_API_KEY: str = ""                   # blank = AI disabled until configured
    LLM_MODEL: str = ""                     # blank = provider default
    LLM_BASE_URL: str = ""                  # for ollama / openai-compatible endpoints
    LLM_PLATFORM_DAILY_LIMIT: int = 50      # max AI questions/user/day on the platform key

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
