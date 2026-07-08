import sys, os, tempfile
sys.path.insert(0, os.path.dirname(__file__))
os.environ['DATABASE_URL'] = 'sqlite:///' + tempfile.mktemp(suffix='.db')
os.environ['SECRET_KEY'] = 'test-secret-key-that-is-at-least-32-chars-long!!'
os.environ['GEMINI_API_KEY'] = 'dummy'
from sqlalchemy import create_engine, text
from app.database import Base
from app.models import User, Music, AudioFeatures, Recommendation

eng = create_engine(os.environ['DATABASE_URL'])
Base.metadata.create_all(bind=eng)
with eng.connect() as conn:
    rows = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='audio_features'")).fetchall()
    print('audio_features:', rows[0][0] if rows else 'NOT FOUND')
    rows = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='recommendations'")).fetchall()
    print('recommendations:', rows[0][0] if rows else 'NOT FOUND')
    rows = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='recommendations'")).fetchall()
    print('recommendations indices:', rows)
