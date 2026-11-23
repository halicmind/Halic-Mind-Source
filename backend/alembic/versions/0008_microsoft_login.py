"""Bind school Microsoft identities to local users using immutable object IDs."""
from alembic import op
import sqlalchemy as sa

revision = '0008_microsoft_login'
down_revision = '0007_password_reset'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('microsoft_object_id', sa.String(36), nullable=True))
    op.create_unique_constraint('uq_users_microsoft_object_id', 'users', ['microsoft_object_id'])


def downgrade():
    op.drop_constraint('uq_users_microsoft_object_id', 'users', type_='unique')
    op.drop_column('users', 'microsoft_object_id')
