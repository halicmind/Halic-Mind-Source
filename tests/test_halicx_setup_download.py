from fastapi.testclient import TestClient
from app.main import app


def test_windows_helper_is_an_attachment_without_authentication():
    response = TestClient(app).get('/halicx-setup-windows.exe')
    assert response.status_code == 200
    assert response.content.startswith(b'MZ')
    assert response.headers['content-type'] == 'application/octet-stream'
    assert 'attachment' in response.headers['content-disposition']
    assert 'HalicMind-HalicX-Kurulum.exe' in response.headers['content-disposition']
    assert response.headers['cache-control'] == 'no-cache'
