"""Encrypted per-student Classroom connection and stable import identities."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0009_classroom'
down_revision = '0008_microsoft_login'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('classroom_connections',
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('google_subject', sa.String(255), nullable=False),
        sa.Column('email', sa.String(254), nullable=False),
        sa.Column('encrypted_refresh_token', sa.Text(), nullable=False),
        sa.Column('connected_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_sync_at', sa.DateTime(timezone=True)),
        sa.Column('preview_hash', sa.String(64)), sa.Column('preview_data', JSONB()),
        sa.Column('preview_expires_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('google_subject', name='uq_classroom_google_subject'))
    op.add_column('enrollments', sa.Column('classroom_source_id', sa.String(64)))
    op.create_unique_constraint('uq_enrollments_classroom_source', 'enrollments', ['user_id', 'term_id', 'classroom_source_id'])
    op.add_column('assignments', sa.Column('classroom_source_id', sa.String(64)))
    op.create_unique_constraint('uq_assignments_classroom_source', 'assignments', ['user_id', 'enrollment_id', 'classroom_source_id'])


def downgrade():
    op.drop_constraint('uq_assignments_classroom_source', 'assignments', type_='unique')
    op.drop_column('assignments', 'classroom_source_id')
    op.drop_constraint('uq_enrollments_classroom_source', 'enrollments', type_='unique')
    op.drop_column('enrollments', 'classroom_source_id')
    op.drop_table('classroom_connections')
