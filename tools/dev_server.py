"""로컬 전용 개발 서버: 게임 파일 제공 + 맵 편집기의 '저장'(POST /__save-layout)을 assets/map-layout.json에 기록.

실행: python tools/dev_server.py [포트]   (기본 8765, 이 PC(127.0.0.1)에서만 접속 가능)
공개 사이트(GitHub Pages)에는 저장 기능이 없으며, 저장된 map-layout.json 파일만 읽습니다.
"""
import http.server, json, os, shutil, socketserver, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LAYOUT = os.path.join(ROOT, 'assets', 'map-layout.json')
BACKUP = os.path.join(ROOT, 'assets', 'map-layout.backup.json')
MAX_BYTES = 2 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass

    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/__save-layout':
            return self.reply(404, {'ok': False, 'error': 'not found'})
        # 다른 사이트에서 보낸 요청은 거부 (같은 로컬 페이지에서만)
        origin = self.headers.get('Origin', '')
        if origin and not origin.startswith(('http://localhost:', 'http://127.0.0.1:')):
            return self.reply(403, {'ok': False, 'error': 'origin'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BYTES:
            return self.reply(413, {'ok': False, 'error': 'size'})
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            assert isinstance(data, dict) and data.get('version') == 1
            assert isinstance(data.get('places'), dict) and isinstance(data.get('props'), list)
        except Exception as e:  # noqa: BLE001
            return self.reply(400, {'ok': False, 'error': f'bad layout: {e}'})
        if os.path.exists(LAYOUT):
            shutil.copyfile(LAYOUT, BACKUP)
        tmp = LAYOUT + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, LAYOUT)
        return self.reply(200, {'ok': True, 'props': len(data['props'])})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), Handler) as server:
        print(f'http://localhost:{port}/index.html  (편집: ?edit=1)', flush=True)
        server.serve_forever()
