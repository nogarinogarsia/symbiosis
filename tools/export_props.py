# Blender 5.3 headless: C:\SYMBIOSIS\{nature,building,furniture,prop}\*.blend -> assets/models/props/<id>.glb + catalog.json
# 실행: blender -b --python tools/export_props.py -- C:/SYMBIOSIS/cozy
#   폴더 안에 nature/building/furniture/prop 하위 폴더가 있으면 그 분류를, 없으면(.blend가 바로 있으면) 이름으로 분류
# 원본 .blend는 저장하지 않음. 각 파일의 메시만 내보내며 모디파이어는 적용해서 내보냄.
import bpy, os, sys, json, mathutils, shutil

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = os.path.abspath(args[0] if args else 'C:/SYMBIOSIS')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'models', 'props')
os.makedirs(OUT, exist_ok=True)

CATEGORIES = ['nature', 'building', 'furniture', 'prop']
NAMES_KO = {
    'festive_star_tree': '별 장식 트리', 'lime_cloud_bush': '연두 구름 덤불', 'lime_leaf_clump': '연두 풀',
    'lime_round_tree': '연두 둥근 나무', 'pastel_flower_bush': '파스텔 꽃덤불', 'pink_blossom_tree': '분홍 꽃나무',
    'sand_round_step': '모래 디딤돌', 'snow_berry_bush': '눈 열매 덤불', 'snow_cloud_bush': '눈 구름 덤불',
    'snow_layered_tree': '눈 덮인 나무', 'olive_tile_open_house': '올리브 기와 집', 'cream_round_fence': '크림 울타리',
    'honey_garden_bench': '꿀색 정원 벤치', 'honey_lantern_post': '꿀색 가로등', 'olive_tile_cat_shelter': '올리브 고양이 쉼터',
    'snow_wood_bench': '눈 나무 벤치', 'winter_bronze_lantern': '겨울 청동 등', 'cream_cat_round_plinth': '크림 고양이 동상',
    'cream_cat_statue': '크림 고양이 동상', 'gift_green_cream_bow': '초록 선물상자', 'gift_red_small_bow': '빨강 작은 선물',
    'gift_red_tall_bow': '빨강 큰 선물', 'santa_scarf_snowman': '산타 목도리 눈사람',
    # 새 마을(키아트 v2)
    'red_hip_cottage': '빨간 기와 오두막', 'red_timber_cottage': '빨간 목조 오두막', 'green_hip_cottage': '초록 기와 오두막',
    'green_timber_cottage': '초록 목조 오두막', 'book_library_hut': '책 도서관', 'village_notice_board': '마을 게시판',
    'cat_shelter_pavilion': '고양이 쉼터 정자', 'plaza_great_tree': '광장 큰 나무', 'wood_picket_fence': '나무 울타리',
    'apple_tree': '사과나무', 'fir_tree': '전나무', 'wooden_windmill': '나무 풍차',
}

def ko_name(aid):
    # 크기 변형본(이름_x2 등)은 원래 이름 + (2배)
    import re
    m = re.match(r'^(.*)_x(\d+(?:\.\d+)?)$', aid)
    if m and m.group(1) in NAMES_KO:
        return f"{NAMES_KO[m.group(1)]} ({m.group(2)}배)"
    return NAMES_KO.get(aid, aid.replace('_', ' '))

def collider_kind(cat, aid, size):
    # solid = 바운딩 박스 전체 충돌, trunk = 줄기만 작은 충돌, none = 통과
    if cat in ('building',) or 'fence' in aid or 'shelter' in aid:
        return 'solid'
    if 'tree' in aid:
        return 'trunk'
    if cat == 'nature':
        return 'none'
    if size[2] < 0.35:
        return 'none'
    return 'solid'

def guess_category(aid):
    if any(k in aid for k in ('house', 'shop', 'library', 'cottage', 'hut', 'pavilion', 'windmill', 'notice_board')):
        return 'building'
    if any(k in aid for k in ('fence', 'shelter', 'bench', 'lantern', 'lamp')):
        return 'furniture'
    if any(k in aid for k in ('tree', 'bush', 'clump', 'grass', 'flower', 'step', 'rock', 'stone')):
        return 'nature'
    return 'prop'

# 새 마을 규격표(분류·충돌·이름)가 있으면 그걸 우선
_spec_path = os.path.join(HERE, 'asset_specs.json')
SPECS = {k: v for k, v in json.load(open(_spec_path, encoding='utf-8')).items() if not k.startswith('_')} if os.path.exists(_spec_path) else {}
for _k, _v in SPECS.items(): NAMES_KO.setdefault(_k, _v['name'])

jobs = []   # (category, folder, filename)
for cat in CATEGORIES:
    folder = os.path.join(SRC, cat)
    if os.path.isdir(folder):
        jobs += [(cat, folder, fn) for fn in sorted(os.listdir(folder)) if fn.endswith('.blend')]
jobs += [(SPECS.get(fn[:-6], {}).get('category') or guess_category(fn[:-6]), SRC, fn) for fn in sorted(os.listdir(SRC)) if fn.endswith('.blend')]

# 기존 목록은 유지하고, 이번에 변환한 에셋만 추가·갱신 (맵에 놓인 예전 에셋이 사라지지 않게)
cat_path = os.path.join(OUT, 'catalog.json')
old = json.load(open(cat_path, encoding='utf-8'))['assets'] if os.path.exists(cat_path) else []
catalog = []
if True:
    for cat, folder, fn in jobs:
        aid = fn[:-6]
        bpy.ops.wm.open_mainfile(filepath=os.path.join(folder, fn))
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get()]
        for o in bpy.context.scene.objects:
            o.select_set(o in meshes)
        dg = bpy.context.evaluated_depsgraph_get()
        mn = mathutils.Vector((1e9, 1e9, 1e9)); mx = -mn.copy(); tris = 0
        for o in meshes:
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            for v in me.vertices:
                p = ev.matrix_world @ v.co
                mn = mathutils.Vector(map(min, mn, p)); mx = mathutils.Vector(map(max, mx, p))
            tris += sum(len(p.vertices) - 2 for p in me.polygons)
            ev.to_mesh_clear()
        if not meshes:
            print('SKIP (no mesh)', fn); continue
        path = os.path.join(OUT, aid + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
                                  export_image_format='JPEG', export_jpeg_quality=88)   # 투명 없는 색 텍스처: JPEG로 용량 절감
        size = [round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3)]
        # glTF 좌표(y-up, Blender -Y 정면 → +Z)로 바운딩 박스 기록
        bbox = {'min': [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)], 'max': [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)]}
        prev = os.path.join(folder, aid + '_preview.png')
        thumb = None
        if os.path.exists(prev):
            im = bpy.data.images.load(prev)
            w, h = im.size
            if w > 0:
                k = 160 / max(w, h)
                im.scale(max(1, int(w * k)), max(1, int(h * k)))
                thumb = aid + '.png'
                im.filepath_raw = os.path.join(OUT, thumb); im.file_format = 'PNG'; im.save()
        catalog.append({'id': aid, 'name': ko_name(aid), 'category': cat,
                        'file': aid + '.glb', 'thumb': thumb, 'size': size, 'bbox': bbox, 'tris': tris,
                        'collider': SPECS.get(aid, {}).get('collider') or collider_kind(cat, aid, size), **({'collider_scale': SPECS[aid]['collider_scale']} if 'collider_scale' in SPECS.get(aid, {}) else {}), 'bytes': os.path.getsize(path)})
        print('OK', cat, aid, size, tris, os.path.getsize(path), flush=True)

new_ids = {a['id'] for a in catalog}
merged = [a for a in old if a['id'] not in new_ids] + catalog
with open(cat_path, 'w', encoding='utf-8') as f:
    json.dump({'version': 1, 'assets': merged}, f, ensure_ascii=False, indent=1)
print('CATALOG total', len(merged), 'new/updated', len(catalog))
print('CATALOG', len(catalog))
