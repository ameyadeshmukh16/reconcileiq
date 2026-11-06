import os

# --- Tolerances (hardcoded named constants, per architecture Section 4) ---
AMOUNT_TOLERANCE_PCT = 2.0        # invoice vs PO amount, percent
QUANTITY_TOLERANCE_UNITS = 0      # billed vs received, units
STALE_INVOICE_DAYS = 90           # invoice older than this is stale

# --- Environment settings ---
DB_PATH = os.getenv("DB_PATH", "reconcileiq.db")

VULTR_API_KEY = os.getenv("VULTR_API_KEY", "")
VULTR_BASE_URL = os.getenv("VULTR_BASE_URL", "")
VULTR_MODEL = os.getenv("VULTR_MODEL", "")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "")

BASIC_AUTH_USER = os.getenv("BASIC_AUTH_USER", "")
BASIC_AUTH_PASSWORD = os.getenv("BASIC_AUTH_PASSWORD", "")
