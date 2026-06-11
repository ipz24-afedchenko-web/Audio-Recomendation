"""Initial migration - create all tables

Revision ID: 001
Revises:
Create Date: 2026-06-11 16:41:23.186000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Create music table
    op.create_table(
        'music',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('artist', sa.String(), nullable=True),
        sa.Column('album', sa.String(), nullable=True),
        sa.Column('genre', sa.String(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_music_id'), 'music', ['id'], unique=False)
    op.create_index(op.f('ix_music_title'), 'music', ['title'], unique=False)
    op.create_index(op.f('ix_music_genre'), 'music', ['genre'], unique=False)

    # Create audio_features table
    op.create_table(
        'audio_features',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('music_id', sa.Integer(), nullable=False),
        sa.Column('tempo', sa.Float(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('key', sa.Integer(), nullable=True),
        sa.Column('mode', sa.Integer(), nullable=True),
        sa.Column('loudness', sa.Float(), nullable=True),
        sa.Column('energy', sa.Float(), nullable=True),
        sa.Column('valence', sa.Float(), nullable=True),
        sa.Column('spectral_centroid_mean', sa.Float(), nullable=True),
        sa.Column('spectral_centroid_std', sa.Float(), nullable=True),
        sa.Column('spectral_bandwidth_mean', sa.Float(), nullable=True),
        sa.Column('spectral_bandwidth_std', sa.Float(), nullable=True),
        sa.Column('spectral_rolloff_mean', sa.Float(), nullable=True),
        sa.Column('spectral_rolloff_std', sa.Float(), nullable=True),
        sa.Column('mfcc_mean', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('mfcc_std', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('zero_crossing_rate_mean', sa.Float(), nullable=True),
        sa.Column('zero_crossing_rate_std', sa.Float(), nullable=True),
        sa.Column('chroma_stft_mean', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('chroma_stft_std', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['music_id'], ['music.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('music_id')
    )
    op.create_index(op.f('ix_audio_features_id'), 'audio_features', ['id'], unique=False)
    op.create_index(op.f('ix_audio_features_cluster_id'), 'audio_features', ['cluster_id'], unique=False)

    # Create recommendations table
    op.create_table(
        'recommendations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('source_music_id', sa.Integer(), nullable=False),
        sa.Column('recommended_music_id', sa.Integer(), nullable=False),
        sa.Column('similarity_score', sa.Float(), nullable=False),
        sa.Column('algorithm', sa.Integer(), nullable=True, default=1),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['source_music_id'], ['music.id'], ),
        sa.ForeignKeyConstraint(['recommended_music_id'], ['music.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recommendations_id'), 'recommendations', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_recommendations_id'), table_name='recommendations')
    op.drop_table('recommendations')
    op.drop_index(op.f('ix_audio_features_cluster_id'), table_name='audio_features')
    op.drop_index(op.f('ix_audio_features_id'), table_name='audio_features')
    op.drop_table('audio_features')
    op.drop_index(op.f('ix_music_genre'), table_name='music')
    op.drop_index(op.f('ix_music_title'), table_name='music')
    op.drop_index(op.f('ix_music_id'), table_name='music')
    op.drop_table('music')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
