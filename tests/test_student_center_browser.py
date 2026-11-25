"""Real FastAPI + isolated PostgreSQL + browser UI workflow. No live account is used."""
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
import pytest
from sqlalchemy import text
from tests.test_academics import academic_app,term,enroll
from tests.test_halicx import pair,data
playwright=pytest.importorskip('playwright.sync_api')

def test_student_center_browser_workflows(academic_app):
    env=academic_app;h,tid=pair(env);course=enroll(env,tid).json()
    assert env.client.post('/api/v1/integrations/halicx/sync',headers=h,json=data()).status_code==200
    a=env.client.post('/api/v1/assignments',json={'enrollment_id':course['id'],'title':'Saatli proje','due_at':'2026-12-01T09:30:45Z','description':'Not'}).json()
    with playwright.sync_playwright() as pw:
        executable=os.getenv('CHROME_EXECUTABLE');local=Path(os.getenv('LOCALAPPDATA',''))/'Google/Chrome/Application/chrome.exe'
        if not executable and local.is_file():executable=str(local)
        try:b=pw.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        except playwright.Error:pytest.skip('Install Playwright Chromium or set CHROME_EXECUTABLE')
        page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        def route(r):
            u=urlsplit(r.request.url)
            assert u.hostname=='testserver','Unexpected external browser request'
            headers={'X-HalicMind-Web':'1','Origin':'http://testserver'}
            if r.request.headers.get('content-type'):headers['Content-Type']=r.request.headers['content-type']
            response=env.client.request(r.request.method,u.path+('?' + u.query if u.query else ''),headers=headers,content=r.request.post_data_buffer)
            r.fulfill(status=response.status_code,headers={k:v for k,v in response.headers.items() if k not in {'content-length','content-encoding','transfer-encoding'}},body=response.content)
        page.route('**/*',route)
        page.goto('https://testserver/app/#/overview');page.wait_for_selector('.student-center')
        page.get_by_role('link',name='Materyaller',exact=False).first.click();page.wait_for_selector('.material-card')
        assert page.locator('.material-card').count()==2
        page.get_by_role('button',name='Okundu işaretle').first.click();page.wait_for_timeout(150)
        assert env.connection.scalar(text('SELECT count(*) FROM halicx_items WHERE unread=false'))==1
        page.locator('.nav-link[href="#/study"]').click();page.wait_for_timeout(200);assert not errors,errors;page.wait_for_selector('[data-study-form]')
        page.locator('[data-study-form] select').select_option(str(course['id']))
        page.locator('[name=duration_minutes]').fill('45');page.locator('[name=notes]').fill('Test çalışma kaydı')
        page.get_by_role('button',name='Çalışmayı kaydet').click();page.get_by_text('Çalışman kaydedildi.',exact=True).wait_for()
        assert env.connection.scalar(text('SELECT sum(duration_minutes) FROM study_sessions'))==45
        page.get_by_role('button',name='Arşivle',exact=True).click();page.get_by_text('Henüz çalışma kaydı yok.',exact=True).wait_for()
        page.get_by_label('Arşivlenenleri göster').check();page.get_by_role('button',name='Geri yükle',exact=True).click()
        assert env.connection.scalar(text('SELECT count(*) FROM study_sessions WHERE archived_at IS NULL'))==1
        # A dirty study form must survive cancellation of navigation.
        page.locator('[name=duration_minutes]').fill('30');page.locator('.nav-link[href="#/courses"]').click()
        page.get_by_role('button',name='Düzenlemeye devam et').click();assert page.locator('[name=duration_minutes]').input_value()=='30'
        page.locator('.nav-link[href="#/assignments"]').click();page.get_by_role('button',name='Kaydetmeden çık',exact=True).click()
        page.locator(f'#assignment-{a["id"]} [data-action="edit-assignment"]').click();page.locator('#assignment-title').fill('Saatli proje düzenlendi')
        page.get_by_role('button',name='Kaydet',exact=True).click();page.wait_for_selector('dialog#modal',state='hidden')
        assert datetime.fromisoformat(env.client.get('/api/v1/assignments/'+str(a['id'])).json()['due_at'])==datetime.fromisoformat('2026-12-01T09:30:45Z')
        for section in ['overview','courses','assignments','exams','materials','study','connections','history','profile']:
            page.goto('https://testserver/app/#/'+section);page.wait_for_timeout(170)
            assert page.locator('.workspace').count()==1,section
            for width in [390,768,1440]:
                page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(section,width)
            if os.getenv('HALICMIND_UI_CAPTURE_DIR') and section in ['overview','materials','study','connections']:
                target=Path(os.environ['HALICMIND_UI_CAPTURE_DIR']);target.mkdir(parents=True,exist_ok=True);page.evaluate('scrollTo({top:0,behavior:"instant"})');page.wait_for_timeout(800);page.screenshot(path=str(target/(section+'-center.png')),full_page=True)
        page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Menüyü aç').click()
        page.get_by_role('button',name='Menüyü kapat').click();assert not page.locator('.workspace').evaluate('(e)=>e.classList.contains("menu-open")')
        assert page.get_by_role('link',name='Verilerimi JSON olarak indir').count()==1
        # Simulate an installed extension bridge; the real API creates the pairing.
        page.add_init_script("""window.addEventListener('message', e=>{const m=e.data;if(m?.source==='halicmind-connect'){window.postMessage({source:'halicmind-extension',id:m.id,ok:true,version:'0.3.0'},location.origin);}});""")
        page.goto('https://testserver/app/#/connections')
        page.reload()
        button=page.locator('[data-halicx-pair] button');button.wait_for()
        playwright.expect(button).to_be_enabled()
        button.click();page.get_by_text('Hesabın uzantıya bağlandı.',exact=False).wait_for()
        assert page.locator('#halicx-key').count()==0
        # A failed materials request must not hide the entire HaliçX setup card.
        page.route('**/api/v1/integrations/halicx/items*',lambda r:r.fulfill(status=200,content_type='application/json',body='{}'))
        page.goto('https://testserver/app/#/connections')
        page.reload()
        page.locator('.halicx-panel').wait_for(state='visible')
        page.locator('.halicx-panel [role="alert"]').wait_for()
        assert page.locator('[data-halicx-refresh]').is_visible()
        assert page.get_by_text('Eşleştirme ve kurulum',exact=True).is_visible()
        assert not errors,errors
        b.close()
