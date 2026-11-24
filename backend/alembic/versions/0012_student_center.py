"""Private study log, with database-enforced enrollment ownership."""
from alembic import op
import sqlalchemy as sa
revision='0012_student_center'
down_revision='0011_halicx_rls'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('enrollments',sa.Column('halicx_source_id',sa.String(12)))
    op.create_unique_constraint('uq_enrollments_halicx_source','enrollments',['user_id','term_id','halicx_source_id'])
    op.create_table('study_sessions',sa.Column('id',sa.BigInteger(),sa.Identity(),primary_key=True),sa.Column('user_id',sa.BigInteger(),nullable=False),sa.Column('enrollment_id',sa.BigInteger(),nullable=False),sa.Column('client_id',sa.Uuid(as_uuid=False),nullable=False),sa.Column('studied_on',sa.Date(),nullable=False),sa.Column('duration_minutes',sa.Integer(),nullable=False),sa.Column('notes',sa.Text()),sa.Column('archived_at',sa.DateTime(timezone=True)),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),sa.ForeignKeyConstraint(['enrollment_id','user_id'],['enrollments.id','enrollments.user_id'],ondelete='RESTRICT',name='fk_study_enrollment_owner'),sa.UniqueConstraint('user_id','client_id',name='uq_study_client'),sa.CheckConstraint('duration_minutes BETWEEN 1 AND 720',name='ck_study_duration'))
    for col in ['user_id','enrollment_id','studied_on']:op.create_index('ix_study_sessions_'+col,'study_sessions',[col])
    op.execute('ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY')
def downgrade():
    op.drop_table('study_sessions')
    op.drop_constraint('uq_enrollments_halicx_source','enrollments',type_='unique')
    op.drop_column('enrollments','halicx_source_id')
