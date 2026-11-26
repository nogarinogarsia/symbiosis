# 실행: python tools/village_layout.py assets/map-layout.before-village-2026-11-22.json assets/map-layout.json
# 참고 그림(마을 지도)대로 map-layout.json 생성. 우리집 장식(사용자 배치)은 우리집·이웃 집에 같은 상대 위치로.
import json, math, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
old = json.load(open(SRC, encoding='utf-8'))
oh = old['places']['home']
home_deco = [dict(p, x=round(p['x'] - oh['x'], 3), z=round(p['z'] - oh['z'], 3)) for p in old['props']
             if abs(p['x'] - oh['x']) < oh.get('gw', 16) / 2 and abs(p['z'] - oh['z']) < oh.get('gd', 14) / 2]

GW, GD = oh.get('gw', 11), oh.get('gd', 12)
HOME = (-12.0, 2.0)
ROW = (0.0, -18.0); GAP = 3.0
STEP = GW + GAP
NEIGH_X = [ROW[0] + k * STEP for k in (-2, -1, 0, 1, 2)]

places = {
    'home': {'x': HOME[0], 'z': HOME[1], 'fence': oh.get('fence', 'cream_round_fence'), 'style': 'garden', 'gw': GW, 'gd': GD},
    'neighbors': {'x': ROW[0], 'z': ROW[1], 'fence': 'cream_round_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'gap': GAP},
    'dex': {'x': -27.5, 'z': 0.5},
    'shop': {'x': 27.5, 'z': 0.5},
    # 고양이 쉼터 그림 자리 = 교배집 (쉼터 모양)
    'breed': {'x': -4.0, 'z': 14.5, 'model': 'olive_tile_cat_shelter', 'ry': 0, 's': 1.5},
    'player': {'x': 7.5, 'z': 18.5},
}

PLAZA = (7.5, 2.5)
roads = [
    {'pts': [[-35, -8.6], [-24, -9.4], [-10, -8.6], [4, -9.4], [18, -8.6], [35, -9.2]], 'w': 3.2},            # 이웃 집 앞 큰길
    {'pts': [[-33, -8.8], [-33.6, -1], [-32, 6.5], [-25.5, 8.6], [-17, 10.8], [-6, 10.4], [1.2, 7.6]], 'w': 3.0},  # 왼쪽 → 우리집 앞 → 광장
    {'pts': [[-27.5, 2.6], [-27.6, 8.0]], 'w': 2.2},                                                         # 도서관 문 → 길
    {'pts': [[7.5, -8.8], [7.3, -4.6]], 'w': 3.0},                                                           # 큰길 → 광장 위
    {'pts': [[13.8, 3.2], [19.5, 5.0], [27.5, 5.6], [34.5, 4.0]], 'w': 3.0},                                 # 광장 → 동물샵
    {'pts': [[27.5, 3.0], [27.5, 5.4]], 'w': 2.2},                                                           # 동물샵 문 → 길
    {'pts': [[7.6, 9.4], [7.9, 15], [7.4, 22]], 'w': 3.4},                                                   # 광장 → 아래 입구
    {'pts': [[7.6, 13.8], [2.5, 17.6], [-4.0, 19.6]], 'w': 2.6},                                             # 아래 길 → 교배집(쉼터) 앞
]
for x in NEIGH_X:                                                                                             # 이웃 마당 문 → 큰길
    roads.append({'pts': [[x, ROW[1] + GD / 2 - 0.2], [x, -9.0]], 'w': 2.0})
roads.append({'pts': [[HOME[0], HOME[1] + GD / 2 - 0.2], [HOME[0], 10.6]], 'w': 2.2})                         # 우리집 문 → 길

plazas = [
    {'x': -27.5, 'z': 1.5, 'r': 6.0, 'kind': 'grass'},     # 도서관 잔디 섬
    {'x': 27.5, 'z': 1.5, 'r': 6.5, 'kind': 'grass'},      # 동물샵 잔디 섬
    {'x': -4.0, 'z': 15.5, 'r': 5.2, 'kind': 'grass'},     # 교배집(쉼터) 잔디 섬
    {'x': 19.5, 'z': 15.0, 'r': 5.0, 'kind': 'grass'},     # (마을 게시판 자리: 아직 비워 둠)
    {'x': PLAZA[0], 'z': PLAZA[1], 'r': 7.0, 'kind': 'stone'},   # 공용 광장 돌바닥
    {'x': PLAZA[0] + 0.6, 'z': PLAZA[1] - 0.3, 'r': 3.6, 'kind': 'lawn'},  # 광장 가운데 잔디
]

props = []
def add(asset, x, z, ry=0.0, s=1.0):
    props.append({'asset': asset, 'x': round(x, 2), 'z': round(z, 2), 'ry': round(ry, 3), 's': round(s, 2)})

# 우리집·이웃 집 장식 (사용자가 우리집에 놓은 배치를 그대로)
for cx, cz in [HOME] + [(x, ROW[1]) for x in NEIGH_X]:
    for p in home_deco:
        add(p['asset'], cx + p['x'], cz + p['z'], p['ry'], p['s'])

# 공용 광장: 벚꽃나무 + 고양이 동상 + 벤치 2 + 가로등 + 꽃
add('pink_blossom_tree', PLAZA[0] + 1.6, PLAZA[1] - 1.0, 0, 1.3)
add('cream_cat_round_plinth', PLAZA[0] - 0.9, PLAZA[1] + 0.6, 0, 1.15)
face = lambda x, z: math.atan2(PLAZA[0] - x, PLAZA[1] - z) % (2 * math.pi)
for bx, bz in [(PLAZA[0] - 5.0, PLAZA[1] - 3.4), (PLAZA[0] + 5.2, PLAZA[1] - 3.2)]:
    add('honey_garden_bench', bx, bz, face(bx, bz), 1.0)
for lx, lz in [(PLAZA[0] - 6.2, PLAZA[1] + 5.4), (PLAZA[0] + 6.6, PLAZA[1] - 5.6), (PLAZA[0] + 6.4, PLAZA[1] + 6.0)]:
    add('honey_lantern_post', lx, lz, 0, 0.85)
for fx, fz, s in [(PLAZA[0] - 0.6, PLAZA[1] + 2.6, 0.55), (PLAZA[0] + 3.2, PLAZA[1] + 2.2, 0.5), (PLAZA[0] - 2.4, PLAZA[1] - 2.0, 0.5)]:
    add('pastel_flower_bush', fx, fz, 0, s)
for fx, fz in [(PLAZA[0] - 8.6, PLAZA[1] - 3.5), (PLAZA[0] + 8.6, PLAZA[1] + 6.8), (PLAZA[0] - 7.8, PLAZA[1] + 7.6)]:
    add('pastel_flower_bush', fx, fz, 0, 0.7)

# 가로등 (길가)
for lx, lz in [(-21.5, 7.2), (-30.4, -4.0), (21.0, 7.6), (33.0, 1.8), (-0.6, 12.8), (10.6, 17.0)]:
    add('honey_lantern_post', lx, lz, 0, 0.85)

# 도서관·동물샵·교배집 주변 덤불·꽃
for x, z, a, s in [(-31.8, -2.0, 'lime_cloud_bush', 0.8), (-23.0, -2.6, 'pastel_flower_bush', 0.6), (-31.0, 4.2, 'pastel_flower_bush', 0.55),
                   (31.8, -2.4, 'lime_cloud_bush', 0.8), (23.2, -2.6, 'pastel_flower_bush', 0.6), (32.2, 4.6, 'lime_leaf_clump', 0.6),
                   (-8.4, 13.0, 'pastel_flower_bush', 0.6), (0.4, 13.4, 'lime_cloud_bush', 0.6), (-8.0, 18.0, 'lime_leaf_clump', 0.6),
                   (17.4, 13.6, 'pastel_flower_bush', 0.6), (21.6, 16.6, 'lime_cloud_bush', 0.7)]:
    add(a, x, z, 0, s)

# 나무: 이웃 집 뒤 숲, 양옆 가장자리, 아래 모서리 숲
for i, x in enumerate(range(-35, 36, 5)):
    add('lime_round_tree', x + (1.2 if i % 2 else 0), -25.0 + (0.8 if i % 3 == 0 else 0), 0, 1.0 + 0.12 * (i % 3))
for x in [x + STEP / 2 for x in NEIGH_X[:-1]]:                       # 이웃 마당 사이
    add('lime_round_tree', x, ROW[1] - 4.0, 0, 0.85)
for x, z, s in [(-35.6, 12.5, 1.1), (-30.5, 15.5, 1.2), (-34.5, 19.5, 1.0), (-25.5, 18.8, 1.15), (-19.5, 15.8, 1.0), (-14.0, 19.6, 1.1),
                (35.5, 11.0, 1.1), (32.0, 16.5, 1.2), (27.0, 20.0, 1.0), (35.0, 20.5, 1.1), (14.5, 21.0, 0.95), (25.5, 11.2, 0.9),
                (-35.6, -13.0, 1.0), (35.6, -13.5, 1.0), (-21.5, -4.6, 0.9), (16.8, -4.4, 0.95), (-1.2, -4.2, 0.85), (1.0, 21.0, 0.9)]:
    add('lime_round_tree', x, z, 0, s)
for x, z, s in [(-21.0, 13.6, 0.9), (13.5, 11.8, 0.85)]:
    add('pink_blossom_tree', x, z, 0, s)
for x, z in [(-28, 13.5), (-11, 15.0), (12.0, 20.0), (24.0, 9.0), (-17.5, -6.4), (33.5, -6.0), (-1.5, 0.0), (15.5, 10.0)]:
    add('lime_leaf_clump', x, z, 0, 0.6)

layout = {'version': 1, 'places': places, 'paths': [], 'randomDecor': False, 'props': props, 'roads': roads, 'plazas': plazas}
json.dump(layout, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('props', len(props), 'roads', len(roads), 'plazas', len(plazas), 'home_deco', len(home_deco))
