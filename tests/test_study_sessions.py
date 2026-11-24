from datetime import timedelta
from uuid import uuid4
from sqlalchemy import text
from tests.test_academics import academic_app,enroll,term
from app.api.v1.endpoints.study_sessions import today

def setup(env):return enroll(env,term(env)['id']).json()
def log(course,**values):return {'enrollment_id':course['id'],'client_id':str(uuid4()),'studied_on':today().isoformat(),'duration_minutes':45,'notes':'  Lineer cebir  ',**values}

def test_study_ownership_idempotence_and_recoverable_archive(academic_app):
    env=academic_app;course=setup(env);body=log(course)
    r=env.client.post('/api/v1/study-sessions',json=body);assert r.status_code==201,r.text
    row=r.json();assert row['notes']=='Lineer cebir'
    assert env.client.post('/api/v1/study-sessions',json=body).json()['id']==row['id']
    assert env.connection.scalar(text('SELECT count(*) FROM study_sessions'))==1
    assert env.client.post('/api/v1/study-sessions',json=body|{'duration_minutes':99}).status_code==409
    assert env.client.post('/api/v1/study-sessions',json=body,headers=env.other_headers).status_code==404
    assert env.client.get('/api/v1/study-sessions',headers=env.other_headers).json()==[]
    assert env.client.delete('/api/v1/study-sessions/'+str(row['id']),headers=env.other_headers).status_code==404
    assert env.client.delete('/api/v1/study-sessions/'+str(row['id'])).status_code==204
    assert env.client.get('/api/v1/study-sessions').json()==[]
    assert env.client.get('/api/v1/study-sessions?include_archived=true').json()[0]['archived_at']
    assert env.client.post('/api/v1/study-sessions/'+str(row['id'])+'/restore').status_code==200
    assert len(env.client.get('/api/v1/study-sessions').json())==1

def test_study_validation_and_archived_parent(academic_app):
    env=academic_app;course=setup(env)
    for change in [{'duration_minutes':0},{'duration_minutes':721},{'studied_on':(today()+timedelta(days=1)).isoformat()},{'notes':'x'*2001}]:
        assert env.client.post('/api/v1/study-sessions',json=log(course,**change)).status_code==422
    env.client.delete('/api/v1/enrollments/'+str(course['id']))
    assert env.client.post('/api/v1/study-sessions',json=log(course)).status_code==409

def test_student_export_contains_only_owned_records_and_no_credentials(academic_app):
    env=academic_app;course=setup(env)
    env.client.post('/api/v1/study-sessions',json=log(course))
    r=env.client.get('/api/v1/users/me/export');assert r.status_code==200
    assert 'attachment' in r.headers['content-disposition'] and r.headers['cache-control']=='no-store'
    data=r.json();assert len(data['study_sessions'])==1 and data['courses'][0]['id']==course['id']
    assert not any(key in r.text for key in ['hashed_password','test-hash','token_hash','encrypted_refresh_token','session_version'])
    other=env.client.get('/api/v1/users/me/export',headers=env.other_headers).json()
    assert other['courses']==other['study_sessions']==other['materials']==[]
