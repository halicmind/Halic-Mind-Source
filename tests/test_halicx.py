import pytest
from sqlalchemy import text
from pydantic import ValidationError
from app.api.v1.endpoints.halicx import Item
from tests.test_academics import academic_app, term

H={'X-HalicMind-Web':'1','Origin':'http://testserver'}

def pair(env):
    tid=term(env)['id']
    r=env.client.post('/api/v1/integrations/halicx/pair',json={'term_id':tid},headers=H)
    assert r.status_code==200,r.text
    key=r.json()['pairing_key']
    headers={'Authorization':'Bearer '+key}
    r=env.client.post('/api/v1/integrations/halicx/selection',headers=headers,json={'courses':['12']});assert r.status_code==200
    return headers,tid

def data(title='Ödev',due='2026-12-01T20:59:00Z'):
    return {'account':'a'*64,'courses':[{'id':'12','name':'Örnek ders','items':[{'id':'assign:23','kind':'assignment','title':title,'description':'Açıklama','url':'https://huzem.halic.edu.tr/UE2/mod/assign/view.php?id=23','due_at':due},{'id':'file:24:0123456789abcdef','kind':'material','title':'Ders.pdf','url':'https://huzem.halic.edu.tr/UE2/pluginfile.php/1/test/Ders.pdf'}]}]}

def test_sync_ownership_idempotence_and_completion(academic_app):
    env=academic_app;headers,tid=pair(env)
    r=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data());assert r.status_code==200,r.text
    assert r.json()['changed']==2
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data()).json()['changed']==0
    env.connection.execute(text("UPDATE assignments SET status='completed',completed_at=now()"))
    r=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data('Yeni başlık'));assert r.status_code==200
    assert env.connection.scalar(text('SELECT count(*) FROM enrollments'))==1
    assert env.connection.scalar(text('SELECT count(*) FROM assignments'))==1
    assert env.connection.scalar(text('SELECT status FROM assignments'))=='completed'
    assert env.client.get('/api/v1/integrations/halicx/items',headers=env.other_headers).json()==[]
    wrong=data();wrong['courses'][0]['id']='999'
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=wrong).status_code==403
    wrong=data();wrong['account']='b'*64
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=wrong).status_code==409

def test_private_files_revocation_and_scope(academic_app):
    env=academic_app;headers,tid=pair(env)
    assert env.client.get('/api/v1/users/me',headers=headers).status_code==401
    response=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data()).json()
    fid=response['uploads'][0]['item_id']
    assert env.client.put(f'/api/v1/integrations/halicx/files/{fid}',headers=headers,content=b'%PDF-test').status_code==200
    r=env.client.get(f'/api/v1/integrations/halicx/files/{fid}')
    assert r.content==b'%PDF-test' and r.headers['content-type']=='application/octet-stream'
    assert 'attachment' in r.headers['content-disposition']
    assert env.client.get(f'/api/v1/integrations/halicx/files/{fid}',headers=env.other_headers).status_code==404
    assert env.client.post('/api/v1/integrations/halicx/sync',json=data()).status_code==401
    assert env.client.delete('/api/v1/integrations/halicx',headers=H).status_code==204
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data()).status_code==401
    assert len(env.client.get('/api/v1/integrations/halicx/items').json())==2

@pytest.mark.parametrize('url',['https://evil.example/x','https://huzem.halic.edu.tr.evil/UE2/a','https://huzem.halic.edu.tr/UE2/a?sesskey=secret','javascript:alert(1)'])
def test_credential_free_source_links(url):
    with pytest.raises(ValidationError):Item(id='resource:12',kind='material',title='Test',url=url)

def test_pair_rotation_expiry_and_session_revocation(academic_app):
    from datetime import datetime,timedelta,timezone
    from app.models.halicx import HalicxConnection
    env=academic_app;headers,tid=pair(env)
    r=env.client.post('/api/v1/integrations/halicx/pair',json={'term_id':tid},headers=H)
    replacement={'Authorization':'Bearer '+r.json()['pairing_key']}
    assert env.client.get('/api/v1/integrations/halicx/settings',headers=headers).status_code==401
    env.connection.execute(text('UPDATE users SET session_version=session_version+1 WHERE id=:uid'),{'uid':env.owner_id})
    assert env.client.get('/api/v1/integrations/halicx/settings',headers=replacement).status_code==401


def test_file_upload_limit_and_unchanged_file(academic_app):
    env=academic_app;headers,tid=pair(env)
    payload=data();payload['courses'][0]['items'][0]['due_at']=None
    r=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=payload)
    assert r.status_code==200 and r.json()['warning']
    fid=r.json()['uploads'][0]['item_id']
    for changed in [True,False]:
        r=env.client.put(f'/api/v1/integrations/halicx/files/{fid}',headers=headers,content=b'file')
        assert r.json()['changed']==changed
    r=env.client.put(f'/api/v1/integrations/halicx/files/{fid}',headers=headers,content=b'x'*(5*1024*1024+1))
    assert r.status_code==413
    assert env.client.get(f'/api/v1/integrations/halicx/files/{fid}').content==b'file'

def test_archived_course_is_not_recreated_and_source_rename_is_reflected(academic_app):
    env=academic_app;headers,tid=pair(env)
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data()).status_code==200
    payload=data();payload['courses'][0]['name']='Yeni ders adı'
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=payload).status_code==200
    assert env.connection.scalar(text('SELECT course_name FROM enrollments'))=='Yeni ders adı'
    env.connection.execute(text('UPDATE enrollments SET archived_at=now()'))
    result=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=payload)
    assert result.status_code==200 and result.json()['archived_skipped']==2
    assert env.connection.scalar(text('SELECT count(*) FROM enrollments'))==1


def test_expired_connection_status_and_stable_item_pagination(academic_app):
    env=academic_app;headers,tid=pair(env)
    env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data())
    first=env.client.get('/api/v1/integrations/halicx/items?limit=1').json()
    second=env.client.get('/api/v1/integrations/halicx/items?limit=1&offset=1').json()
    assert len(first)==len(second)==1 and first[0]['id']!=second[0]['id']
    env.connection.execute(text("UPDATE halicx_connections SET expires_at=now()-interval '1 day'"))
    status=env.client.get('/api/v1/integrations/halicx').json()
    assert status['connected'] is False and status['paired'] is True and status['needs_repair'] is True
    assert env.client.get('/api/v1/integrations/halicx/settings',headers=headers).status_code==401


def test_full_item_quota_allows_existing_content_updates(academic_app):
    env=academic_app;headers,tid=pair(env)
    env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data())
    env.connection.execute(text("""INSERT INTO halicx_items (user_id,term_id,enrollment_id,source_id,kind,title,source_url,content_hash,unread,file_size)
        SELECT user_id,term_id,enrollment_id,'12:page:'||g,'material','Seed','https://huzem.halic.edu.tr/UE2/mod/page/view.php?id='||g,'seed',false,0
        FROM (SELECT * FROM halicx_items LIMIT 1) s CROSS JOIN generate_series(1,4998) g"""))
    r=env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=data('Güncel'))
    assert r.status_code==200 and r.json()['changed']==1
    payload=data('Güncel');payload['courses'][0]['items'].append({'id':'folder:999999','kind':'material','title':'Klasör','url':'https://huzem.halic.edu.tr/UE2/mod/folder/view.php?id=999999'})
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=headers,json=payload).status_code==413
