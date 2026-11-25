"""Both panels share a real app/database; only Google and extension are simulated."""
import os
from pathlib import Path
from urllib.parse import urlsplit
import pytest
from fastapi import HTTPException
from sqlalchemy import text
from tests.test_academics import academic_app, term, profile
from tests.test_classroom import google_config, provider, seed_connection, BASE

playwright = pytest.importorskip('playwright.sync_api')


def test_connections_preserve_target_and_recover_course_list_and_preview(academic_app, provider, monkeypatch):
    from app.services import classroom
    env = academic_app
    profile(env)
    seed_connection(env)
    mode = {'fail': False}

    def courses(_):
        if mode['fail']:
            raise HTTPException(403, 'Google izinlerini yenile.')
        return [{'id': 'course-1', 'name': 'Algoritma', 'section': 'A'}]

    monkeypatch.setattr(classroom, 'list_courses', courses)
    with playwright.sync_playwright() as pw:
        executable = os.getenv('CHROME_EXECUTABLE')
        local = Path(os.getenv('LOCALAPPDATA', '')) / 'Google/Chrome/Application/chrome.exe'
        if not executable and local.is_file():
            executable = str(local)
        try:
            browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        except playwright.Error:
            pytest.skip('Install Chromium or set CHROME_EXECUTABLE')
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.set_default_timeout(7000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def route(r):
            u = urlsplit(r.request.url)
            assert u.hostname == 'testserver'
            headers = {'X-HalicMind-Web': '1', 'Origin': BASE}
            if r.request.headers.get('content-type'):
                headers['Content-Type'] = r.request.headers['content-type']
            result = env.client.request(r.request.method, u.path + ('?' + u.query if u.query else ''),
                                        headers=headers, content=r.request.post_data_buffer)
            r.fulfill(status=result.status_code, body=result.content,
                      headers={k:v for k,v in result.headers.items() if k not in {'content-length','content-encoding','transfer-encoding'}})

        page.route('**/*', route)
        page.add_init_script("""window.addEventListener('message',e=>{const m=e.data;if(m?.source==='halicmind-connect')window.postMessage({source:'halicmind-extension',id:m.id,ok:true},location.origin);});""")
        page.goto('https://testserver/app/#/connections')
        gc = page.locator('#classroom-panel')
        gc.get_by_label('Algoritma · A').wait_for()
        assert gc.get_by_role('button', name='Önizlemeyi hazırla').is_disabled()
        # Courses remain visible without a target term; failed requests aren't empty lists.
        mode['fail'] = True
        gc.get_by_role('button', name='Dersleri yenile').click()
        gc.get_by_role('alert').filter(has_text='Ders listesi alınamadı').wait_for()
        assert gc.get_by_text('aktif ders bulunamadı', exact=False).count() == 0
        mode['fail'] = False
        gc.get_by_role('button', name='Dersleri yenile').click()
        gc.get_by_label('Algoritma · A').wait_for()
        first = term(env)
        second = term(env, academic_year=2025, term_type='spring')
        page.get_by_role('button', name='Verileri yenile', exact=True).click()
        page.locator('#classroom-term option').filter(has_text='2025').wait_for(state='attached')
        hx = page.locator('#halicx-panel')
        hx.locator('[name=term]').select_option(str(second['id']))
        hx.locator('[data-halicx-refresh]').click()
        playwright.expect(hx.locator('[data-halicx-pair] button')).to_be_enabled()
        assert hx.locator('[name=term]').input_value() == str(second['id'])
        gc.locator('#classroom-term').select_option(str(second['id']))
        gc.get_by_label('Algoritma · A').check()
        hx.locator('[data-halicx-pair] button').click()
        hx.get_by_text('Hesabın uzantıya bağlandı.', exact=False).wait_for()
        assert env.connection.scalar(text('SELECT term_id FROM halicx_connections')) == second['id']
        assert gc.get_by_label('Algoritma · A').is_checked()
        gc.get_by_role('button', name='Önizlemeyi hazırla').click()
        gc.get_by_role('button', name='Onayla ve döneme aktar').wait_for()
        assert env.connection.scalar(text('SELECT preview_data FROM classroom_connections'))['term_id'] == second['id']
        env.connection.execute(text("UPDATE classroom_connections SET preview_expires_at=now()-interval '1 minute'"))
        gc.get_by_role('button', name='Onayla ve döneme aktar').click()
        gc.get_by_role('alert').filter(has_text='Önizleme geçersiz').wait_for()
        assert gc.get_by_role('button', name='Onayla ve döneme aktar').count() == 0
        gc.get_by_role('button', name='Önizlemeyi hazırla').click()
        gc.get_by_role('button', name='Onayla ve döneme aktar').click()
        gc.get_by_text('1 ders ve 1 ödev eklendi', exact=False).wait_for()
        assert env.connection.scalar(text('SELECT count(*) FROM enrollments')) == 1
        assert env.connection.scalar(text('SELECT term_id FROM enrollments')) == second['id']
        for width in [390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors, errors
        browser.close()
