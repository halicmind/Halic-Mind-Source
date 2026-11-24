from datetime import timedelta
from tests.test_academics import academic_app
from tests.test_study_sessions import setup,log
from app.api.v1.endpoints.study_sessions import today

def test_study_summary_is_actual_owned_non_archived_last_seven_days(academic_app):
    env=academic_app;course=setup(env)
    env.client.post('/api/v1/study-sessions',json=log(course,duration_minutes=45))
    env.client.post('/api/v1/study-sessions',json=log(course,duration_minutes=30,studied_on=(today()-timedelta(days=6)).isoformat()))
    env.client.post('/api/v1/study-sessions',json=log(course,duration_minutes=120,studied_on=(today()-timedelta(days=7)).isoformat()))
    r=env.client.get('/api/v1/analytics/study?term_id='+str(course['term_id']));assert r.status_code==200,r.text
    assert r.json()['total_minutes']==75 and r.json()['today_minutes']==45 and len(r.json()['days'])==7
    assert env.client.get('/api/v1/analytics/study',headers=env.other_headers).json()['total_minutes']==0
    assert env.client.get('/api/v1/analytics/study?term_id='+str(course['term_id']),headers=env.other_headers).status_code==404
    row=env.client.get('/api/v1/study-sessions').json()[0]
    env.client.delete('/api/v1/study-sessions/'+str(row['id']))
    assert env.client.get('/api/v1/analytics/study').json()['total_minutes']==30
