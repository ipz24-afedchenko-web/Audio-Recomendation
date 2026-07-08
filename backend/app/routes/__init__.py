from app.routes.auth import router as auth_router
from app.routes.music import router as music_router
from app.routes.analyze import router as analyze_router
from app.routes.recommend import router as recommend_router
from app.routes.ab_testing import router as ab_router
from app.routes.admin import router as admin_router

__all__ = ["auth_router", "music_router", "analyze_router", "recommend_router", "ab_router", "admin_router"]
