"""Optional browser checks; every school response is intercepted with local fixtures."""
import os
from pathlib import Path
import pytest
playwright=pytest.importorskip('playwright.sync_api')
BASE='https://huzem.halic.edu.tr/UE2/'
HEADER='<a href="/UE2/user/profile.php?id=999">Öğretim elemanı</a><div class="usermenu"><button id="user-menu-toggle"></button><a href="/UE2/user/profile.php?id=123">Profilim</a></div><script>var M={};M.cfg={"userid":123};</script>'
@pytest.fixture
def school_browser():
    with playwright.sync_playwright() as pw:
        executable=os.getenv('CHROME_EXECUTABLE')
        local=Path(os.getenv('LOCALAPPDATA',''))/'Google/Chrome/Application/chrome.exe'
        if not executable and local.is_file():executable=str(local)
        try:browser=pw.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        except playwright.Error:pytest.skip('Install Playwright Chromium or set CHROME_EXECUTABLE')
        page=browser.new_page()
        pages={BASE+'my/':HEADER+'<a href="../course/view.php?id=12">Örnek ders</a>',BASE+'course/view.php?id=12':HEADER+'<h1>Örnek ders</h1><div id="region-main"><a href="../mod/assign/view.php?id=23">Proje</a><a href="../mod/resource/view.php?id=24">Notlar</a><a href="../mod/folder/view.php?id=25">Ders klasörü</a></div>',BASE+'mod/assign/view.php?id=23':HEADER+'<h1>Proje teslimi</h1><div class="activity-dates"><div>Açıldı: 24 Kasım 2026 Salı, 00:00</div><div>Son tarih: 29 Kasım 2026 Pazar, 23:59</div></div><div id="intro">Proje raporunu yükleyin.</div>',BASE+'mod/folder/view.php?id=25':HEADER+'<h1>Haftalık notlar</h1><div id="region-main"><div class="foldertree"><a href="../../pluginfile.php/12/mod_folder/content/1/hafta.pdf">Hafta notları</a></div></div>'}
        def route(r):
            url=r.request.url
            if url==BASE+'mod/resource/view.php?id=24':r.fulfill(content_type='application/pdf',body=b'%PDF-test')
            elif '/pluginfile.php/' in url:r.fulfill(content_type='application/pdf',body=b'%PDF-test')
            elif url in pages:r.fulfill(content_type='text/html; charset=utf-8',body=pages[url])
            else:r.fulfill(status=404)
        page.route('**/*',route)
        page.add_init_script("window.chrome={runtime:{id:'test',onMessage:{addListener:fn=>window.halicxListener=fn}}};")
        page.goto(BASE+'my/');page.add_script_tag(content=(Path(__file__).resolve().parents[1]/'extension/halicx/content.js').read_text(encoding='utf-8-sig'))
        yield page,pages
        browser.close()
def send(page,message):return page.evaluate("m=>new Promise(resolve=>halicxListener(m,{id:'test'},resolve))",message)
def test_relative_links_folders_direct_pdf_and_partial_course_failure(school_browser):
    page,_=school_browser
    assert send(page,{'action':'discover'})['data']==[{'id':'12','name':'Örnek ders'}]
    result=send(page,{'action':'scan','ids':['12','99'],'jobId':'test-round'});assert 'error' not in result,result
    data=result['data'];assert len(data['errors'])==1 and data['errors'][0]['id']=='99'
    items=data['courses'][0]['items'];assert items[0]['title']=='Proje teslimi' and items[0]['due_at']=='2026-11-29T20:59:00.000Z'
    assert any(i['id'].startswith('folder:25') for i in items)
    assert len(data['files'])==2
    assert any('/UE2/pluginfile.php/' in u for u in data['files'].values())
    assert any(i['title']=='Notlar' and i['id'].startswith('file:24:') for i in items)
    assert len(data['account'])==64
    assert send(page,{'action':'file','url':next(iter(data['files'].values()))})['data']=='JVBERi10ZXN0'
def test_invalid_calendar_date_is_not_normalized_to_a_different_deadline(school_browser):
    page,_=school_browser
    assert page.evaluate("dueDate(new DOMParser().parseFromString('<div class=\"activity-dates\">Due: 31 February 2026, 11:59 PM</div>','text/html'))") is None
def test_wrong_profile_link_and_changed_signed_in_account(school_browser):
    page,pages=school_browser
    assert send(page,{'action':'account'})['data']==page.evaluate("hash('huzem.halic.edu.tr/UE2/user/123')")
    pages[BASE+'course/view.php?id=12']=HEADER.replace('"userid":123','"userid":456')+'<h1>Başka hesap</h1><div id="region-main"></div>'
    assert 'hesabı değişti' in send(page,{'action':'scan','ids':['12'],'jobId':'changed'})['error']
