"""Prevent direct Supabase API access to HaliçX pairing and private file records."""
from alembic import op
revision='0011_halicx_rls'
down_revision='0010_halicx'
branch_labels=None
depends_on=None

def upgrade():
    op.execute('ALTER TABLE halicx_connections ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE halicx_items ENABLE ROW LEVEL SECURITY')

def downgrade():
    op.execute('ALTER TABLE halicx_items DISABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE halicx_connections DISABLE ROW LEVEL SECURITY')
