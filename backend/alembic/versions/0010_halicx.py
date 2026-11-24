"""Scoped HaliçX synchronization and private bounded file copies."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision='0010_halicx'
down_revision='0009_classroom'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('halicx_connections',
        sa.Column('user_id',sa.BigInteger(),sa.ForeignKey('users.id'),primary_key=True),
        sa.Column('term_id',sa.BigInteger(),sa.ForeignKey('academic_terms.id'),nullable=False),
        sa.Column('token_hash',sa.String(64),unique=True),sa.Column('session_version',sa.Integer(),nullable=False),
        sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False),sa.Column('selected_courses',JSONB(),nullable=False),
        sa.Column('source_account',sa.String(64)),sa.Column('last_sync_at',sa.DateTime(timezone=True)),sa.Column('last_error',sa.String(100)))
    op.create_table('halicx_items',
        sa.Column('id',sa.BigInteger(),sa.Identity(),primary_key=True),
        sa.Column('user_id',sa.BigInteger(),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('term_id',sa.BigInteger(),sa.ForeignKey('academic_terms.id'),nullable=False),
        sa.Column('enrollment_id',sa.BigInteger(),sa.ForeignKey('enrollments.id'),nullable=False),
        sa.Column('assignment_id',sa.BigInteger(),sa.ForeignKey('assignments.id')),
        sa.Column('source_id',sa.String(100),nullable=False),sa.Column('kind',sa.String(20),nullable=False),
        sa.Column('title',sa.String(200),nullable=False),sa.Column('description',sa.Text()),sa.Column('source_url',sa.String(2048),nullable=False),
        sa.Column('content_hash',sa.String(64),nullable=False),sa.Column('unread',sa.Boolean(),nullable=False),
        sa.Column('file_data',sa.LargeBinary()),sa.Column('file_size',sa.Integer(),nullable=False),
        sa.Column('file_name',sa.String(200)),sa.Column('file_hash',sa.String(64)),
        sa.Column('updated_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.UniqueConstraint('user_id','term_id','source_id',name='uq_halicx_source'))
    op.create_index('ix_halicx_items_user_id','halicx_items',['user_id'])

def downgrade():
    op.drop_table('halicx_items')
    op.drop_table('halicx_connections')
