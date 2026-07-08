import os
from slowapi import Limiter
from slowapi.util import get_remote_address

ENV = os.getenv("ENVIRONMENT", "").lower()

if ENV == "test":
    # In test mode, rate limits are a no-op so the test suite does not
    # get blocked by the 5/min register limit across 60+ tests.
    class _NoopLimiter:
        enabled = False
        def limit(self, *args, **kwargs):
            return lambda f: f
    limiter: Limiter = _NoopLimiter()  # type: ignore[assignment]
else:
    limiter = Limiter(key_func=get_remote_address, default_limits=[])
