"""Authorize the sender once; save credentials only in an ignored local env file."""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import time
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

SCOPE = 'https://www.googleapis.com/auth/gmail.send'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / '.env.gmail')
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Output already exists; existing credentials preserved.')
    client = json.loads(args.client_file.read_text(encoding='utf-8')).get('installed')
    if not client or not client.get('client_id') or not client.get('client_secret'):
        raise SystemExit('Provide a Desktop app OAuth client JSON file.')
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    callback_path = '/callback/' + secrets.token_urlsafe(20)
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Authorization codes must never appear in access logs.

        def do_GET(self):
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            valid = url.path == callback_path and secrets.compare_digest(query.get('state', [''])[0], state)
            if valid and query.get('code'):
                result['code'] = query['code'][0]
                status, message = 200, 'HalicMind Gmail authorization received. You can close this tab.'
            elif valid and query.get('error'):
                result['denied'] = True
                status, message = 400, 'Authorization was not granted.'
            else:
                status, message = 400, 'Invalid authorization callback.'
            self.send_response(status)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(message.encode())

    with HTTPServer(('127.0.0.1', 0), Callback) as server:
        server.timeout = 2
        redirect_uri = f'http://127.0.0.1:{server.server_port}{callback_path}'
        url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({
            'client_id': client['client_id'], 'redirect_uri': redirect_uri,
            'response_type': 'code', 'scope': SCOPE, 'access_type': 'offline',
            'prompt': 'consent', 'login_hint': 'halicmind@gmail.com', 'state': state,
            'code_challenge': challenge, 'code_challenge_method': 'S256',
        })
        print('Open this URL and authorize halicmind@gmail.com:', flush=True)
        print(url, flush=True)
        deadline = time.monotonic() + 300
        while not result and time.monotonic() < deadline:
            server.handle_request()
    if not result.get('code'):
        raise SystemExit('Authorization cancelled or timed out. No credentials saved.')
    request = Request('https://oauth2.googleapis.com/token', method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        data=urlencode({'client_id': client['client_id'], 'client_secret': client['client_secret'],
                        'code': result['code'], 'code_verifier': verifier,
                        'redirect_uri': redirect_uri, 'grant_type': 'authorization_code'}).encode())
    with urlopen(request, timeout=20) as response:
        token = json.load(response)
    if not token.get('refresh_token'):
        raise SystemExit('No refresh token received. No credentials saved.')
    values = {'MAIL_PROVIDER': 'gmail', 'GMAIL_CLIENT_ID': client['client_id'],
              'GMAIL_CLIENT_SECRET': client['client_secret'], 'GMAIL_REFRESH_TOKEN': token['refresh_token'],
              'GMAIL_SENDER': 'halicmind@gmail.com'}
    # Dotenv quoted values preserve special characters and are never printed.
    with os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as file:
        for key, value in values.items():
            file.write(f"{key}='" + value.replace('\\', '\\\\').replace("'", "\\'") + "'\n")
    print(f'Gmail authorization saved to {args.output}. No email was sent.', flush=True)


if __name__ == '__main__':
    main()
