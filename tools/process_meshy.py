"""Meshy 결과 폴더 한 번에 처리: <폴더>/*.glb|fbx → <폴더>/blend/*.blend (팀 규칙 정리) → 게임용 GLB + 편집기 목록.

실행 (일반 Python):  python tools/process_meshy.py C:/SYMBIOSIS/map [에셋이름 ...]
- 파일 이름(확장자 뺀 것)이 tools/asset_specs.json의 이름과 같아야 크기·분류가 자동 적용됨
- 규격표에 없는 이름은 높이를 바꾸지 않고 정리만 함 (보고서에 표시)
- 원본 Meshy 파일은 읽기만 함
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.environ.get('BLENDER', r'C:\SYMBIOSIS\tools\blender\Blender Foundation\Blender 5.3\blender.exe')
SPECS = {k: v for k, v in json.load(open(os.path.join(HERE, 'asset_specs.json'), encoding='utf-8')).items() if not k.startswith('_')}

src = os.path.abspath(sys.argv[1]); only = set(sys.argv[2:])
out_dir = os.path.join(src, 'blend'); os.makedirs(out_dir, exist_ok=True)
files = [f for f in sorted(os.listdir(src)) if f.lower().endswith(('.glb', '.gltf', '.fbx'))]
reports = []
for f in files:
    aid = os.path.splitext(f)[0]
    if only and aid not in only: continue
    spec = SPECS.get(aid)
    if f.lower().endswith('.fbx'):
        print('SKIP (FBX는 GLB로 다시 받아 주세요)', f); continue
    cmd = [BLENDER, '-b', '--python-exit-code', '1', '--python', os.path.join(HERE, 'clean_meshy.py'), '--',
           os.path.join(src, f), os.path.join(out_dir, aid + '.blend'), aid, str(spec['height']) if spec else '-']
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    line = next((l for l in r.stdout.splitlines() if l.startswith('REPORT ')), None)
    if r.returncode or not line:
        print('FAIL', f, (r.stderr or r.stdout)[-800:]); continue
    rep = json.loads(line[7:]); rep['spec'] = bool(spec)
    if spec: rep['tris_target'] = spec['tris']; rep['tris_over'] = rep['tris'] > spec['tris'] * 1.2
    reports.append(rep); print('OK', aid, rep['size_m'], rep['tris'], '' if spec else '(규격표에 없음: 크기 그대로)')
    bk = os.path.join(out_dir, aid + '.blend1')
    if os.path.exists(bk): os.remove(bk)

r = subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '--python', os.path.join(HERE, 'export_props.py'), '--', out_dir],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
print('\n'.join(l for l in r.stdout.splitlines() if l.startswith(('OK ', 'CATALOG'))))
json.dump(reports, open(os.path.join(out_dir, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
