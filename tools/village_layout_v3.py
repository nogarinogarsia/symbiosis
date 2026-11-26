# 키아트 v2를 최대한 그대로 → assets/map-layout.json
# 실행: python tools/village_layout_v3.py <이전 배치.json> assets/map-layout.json
# 화면 위쪽 = -z, 맵 범위 x -36~36, z -26~22.
# 층(높이): 뒤쪽 숲 3단 · 위층(이웃 집 3채) 2단 · 가운데층(광장·도서관·게시판·우리집·왼쪽 이웃) 1단 · 아래층(고양이 쉼터) 0
import json, math, sys, random
SRC, OUT = sys.argv[1], sys.argv[2]
old = json.load(open(SRC, encoding='utf-8'))
rnd = random.Random(7)

STEP = 0.6 * 2.4 * 0.6 * 1.5          # 한 단 높이 = 돌 축대(크기 1.5) 높이 ≈ 1.3
WALL_S = 1.5                          # 축대·계단 크기 배율
WALL = 2.406 * 2.4 * 0.6 * WALL_S     # 축대 한 칸 길이 ≈ 5.2
GW, GD = 11, 12
Z_BACK, Z_A, Z_B = -23.6, -6.4, 11.4  # 지형 경계선
STAIR_A = [0.0, 17.5]; STAIR_B = [4.0]

HOME = (25.0, 2.5)
NEIGH = [
    {'x': -15.0, 'z': -16.0, 'house': 'red_hip_cottage_2'},     # 위 왼쪽 빨간 기와
    {'x': 0.0,   'z': -16.5, 'house': 'red_timber_cottage'},    # 위 가운데 빨간 목조
    {'x': 15.0,  'z': -16.0, 'house': 'green_hip_cottage'},     # 위 오른쪽 초록 기와
    {'x': -26.0, 'z': 1.5,   'house': 'green_timber_cottage'},  # 왼쪽 가운데 초록 목조
    {'x': -30.0, 'z': -16.0, 'house': 'red_timber_cottage'},    # (키아트 밖) 맨 왼쪽 위
]
PLAZA = (0.5, 2.5); PR = 8.2

places = {
    'home': {'x': HOME[0], 'z': HOME[1], 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'house': 'red_hip_cottage'},
    'neighbors': {'x': 0.0, 'z': -16.0, 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'gap': 3, 'slots': NEIGH},
    'dex': {'x': -10.0, 'z': -0.5, 'model': 'book_library_hut', 'ry': 0, 's': 1},
    'breed': {'x': -21.0, 'z': 14.6, 'model': 'cat_shelter_pavilion', 'ry': 0, 's': 1},
    'shop': {'x': 31.0, 'z': -15.0},
    'player': {'x': HOME[0], 'z': HOME[1] + GD / 2 + 1.5},
}

roads = [
    {'pts': [[-36, -8.6], [-22, -8.9], [-8, -8.5], [8, -8.9], [22, -8.5], [36, -8.8]], 'w': 2.8},   # 위층 큰길 (이웃 집 앞)
    {'pts': [[0, -8.6], [0, -5.3]], 'w': 2.6},                                                   # 가운데 계단 → 광장
    {'pts': [[17.5, -8.6], [17.5, -4.4], [17.2, 2.0], [15.8, 8.6]], 'w': 2.4},                  # 오른쪽 계단 → 우리집 길
    {'pts': [[-26, 7.7], [-21, 9.2], [-14, 9.5], [-7.4, 7.6]], 'w': 2.6},                       # 왼쪽 이웃 → 광장
    {'pts': [[8.4, 6.8], [13.5, 8.8], [19.5, 9.6], [25, 9.6], [31, 9.6], [36, 9.2]], 'w': 2.6},  # 광장 → 우리집 → 오른쪽
    {'pts': [[4.0, 10.0], [4.0, 13.4]], 'w': 2.6},                                               # 아래 계단 → 아래층
    {'pts': [[4.0, 13.4], [-4, 15.4], [-12, 17.2], [-19, 18.2]], 'w': 2.4},                     # 아래층 → 고양이 쉼터
    {'pts': [[4.4, 13.4], [5.4, 17.6], [6.0, 22]], 'w': 2.6},                                    # 아래층 → 마을 입구
    {'pts': [[4.8, 13.6], [14, 15.6], [24, 16.4], [36, 15.4]], 'w': 2.4},                        # 아래층 → 오른쪽
    {'pts': [[31, -12.4], [31, -9.6]], 'w': 1.8},                                                # 동물샵 문 → 큰길
]
for q in NEIGH:
    if q['z'] < 0: roads.append({'pts': [[q['x'], q['z'] + GD / 2 - 0.2], [q['x'], -8.8]], 'w': 1.8})

plazas = [{'x': PLAZA[0], 'z': PLAZA[1], 'r': PR, 'kind': 'stone'},
          {'x': 1.6, 'z': 8.7, 'r': 1.0, 'kind': 'paw'}]

props = []
def add(a, x, z, ry=0.0, s=1.0):
    props.append({'asset': a, 'x': round(x, 2), 'z': round(z, 2), 'ry': round(ry % (2 * math.pi), 3), 's': round(s, 2)})
face = lambda x, z, tx, tz: math.atan2(tx - x, tz - z)
def near_road(x, z, pad=1.6):
    for r in roads:
        for (x0, z0), (x1, z1) in zip(r['pts'], r['pts'][1:]):
            L = math.hypot(x1 - x0, z1 - z0) or 1; t = max(0, min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / L ** 2))
            if math.hypot(x - (x0 + t * (x1 - x0)), z - (z0 + t * (z1 - z0))) < r['w'] / 2 + pad: return True
    return False

# ── 마당: 문 → 현관 디딤돌, 울타리 안쪽 꽃밭, 풀 (키아트 정원)
for cx, cz in [HOME] + [(q['x'], q['z']) for q in NEIGH]:
    front = cz + GD / 2
    for k, dz in enumerate((1.2, 2.4, 3.6)):
        add('gray_stepping_stone', cx + (0.35 if k % 2 else -0.15), front - dz, rnd.uniform(0, 6), 1.0)
    for x, a in [(cx - GW / 2 + 1.3, 'red_flower_bush'), (cx - GW / 2 + 2.9, 'white_flower_bush'), (cx + GW / 2 - 1.3, 'red_flower_bush'), (cx + GW / 2 - 2.9, 'red_flower_bush')]:
        add(a, x, front - 1.4, rnd.uniform(0, 6), 0.95)
    add('tall_grass_clump', cx - GW / 2 + 1.3, cz - 1.0, 0, 1.1); add('tall_grass_clump', cx + GW / 2 - 1.3, cz - 0.4, 0, 1.0)
    add('flower_pot', cx + 2.6, cz - 1.6, 0, 1.0)

# ── 공용 광장
add('plaza_great_tree', PLAZA[0], PLAZA[1] - 0.8, 0, 1.05)
for bx, bz in [(-4.6, 6.6), (5.6, 6.4)]:
    add('wood_slat_bench', bx, bz, face(bx, bz, PLAZA[0], PLAZA[1] - 0.8), 1.0)
add('cat_statue_pedestal', -1.9, 7.0, 0, 1.6)
for fx, fz in [(-2.4, 8.8), (6.8, 8.0), (-5.8, 2.0), (7.0, 2.2)]:
    add('flower_planter_box', fx, fz, face(fx, fz, *PLAZA), 1.0)
# 도서관·게시판 앞 등불·화분 (키아트: 두 건물 옆에 등불)
add('wood_lantern_post', -14.4, 2.6, 0, 1.0); add('wood_lantern_post', 7.9, -2.6, 0, 1.0)
add('village_notice_board', 11.2, -0.6, 0, 1.0)
for fx, fz in [(8.4, 1.6), (13.9, 1.8), (-6.8, 2.2), (-13.6, 4.2)]: add('flower_pot', fx, fz, 0, 1.0)

# ── 고양이 쉼터 (아래층 왼쪽)
B = places['breed']
add('cat_face_signboard', B['x'] - 5.0, B['z'] + 1.6, 0.25, 1.6)
add('cat_food_bowl_table', B['x'] - 2.4, B['z'] + 4.6, 0, 1.6)
add('cat_scratch_post', B['x'] + 4.4, B['z'] + 1.4, 0, 1.6)
add('hollow_log_tunnel', B['x'] + 7.2, B['z'] - 0.4, 0.35, 1.4)
for sx, sz in [(B['x'] + 3.4, B['z'] - 1.4), (B['x'] + 5.6, B['z'] - 1.0), (B['x'] - 5.6, B['z'] - 1.6), (B['x'] + 9.6, B['z'] + 1.6)]:
    add('tree_stump_seat', sx, sz, rnd.uniform(0, 6), 1.3)
add('wood_slat_bench', B['x'] - 0.6, B['z'] + 6.8, 0, 1.0)
add('cat_cushion_basket', B['x'] + 2.4, B['z'] + 2.6, 0, 1.5)
for fx, fz in [(B['x'] - 4.6, B['z'] + 4.2), (B['x'] + 6.8, B['z'] + 3.0)]: add('flower_pot', fx, fz, 0, 1.0)
for i in range(9):   # 쉼터 마당 둘레 작은 돌 (키아트의 돌 테두리)
    a = math.pi * (0.15 + 0.7 * i / 8); add('small_rock', B['x'] + 2 + math.cos(a) * 11.5, B['z'] + 1.5 - math.sin(a) * 4.5, rnd.uniform(0, 6), 1.0)

# ── 돌 축대 줄 + 계단
def wall_line(z, gaps, stairs):
    x = -36.0
    while x + WALL / 2 <= 36.5:
        cx = x + WALL / 2
        if not any(abs(cx - g) < WALL / 2 + 1.5 for g in gaps): add('stone_retaining_wall', cx, z, 0, WALL_S)
        x += WALL
    for sx in stairs: add('stone_wood_steps', sx, z, 0, WALL_S)
wall_line(Z_BACK, [], [])
wall_line(Z_A, STAIR_A, STAIR_A)
wall_line(Z_B, STAIR_B, STAIR_B)

# ── 축대 따라 꽃밭 (키아트: 층 경계마다 빨강·흰 꽃)
for z, xs in [(Z_A + 1.3, range(-34, 36, 2)), (Z_B - 1.2, range(-34, 36, 2)), (Z_B + 1.4, range(-34, 36, 2)), (Z_BACK + 1.2, range(-34, 36, 3))]:
    for x in xs:
        x = x + rnd.uniform(-0.4, 0.4)
        if near_road(x, z, 0.8) or (abs(x - PLAZA[0]) < PR + 1 and abs(z - PLAZA[1]) < PR + 1): continue
        if any(abs(x - q['x']) < GW / 2 + 0.5 and abs(z - q['z']) < GD / 2 + 0.5 for q in NEIGH) or (abs(x - HOME[0]) < GW / 2 + 0.5 and abs(z - HOME[1]) < GD / 2 + 0.5): continue
        r = rnd.random()
        add('red_flower_bush' if r < 0.45 else 'white_flower_bush' if r < 0.7 else 'green_round_bush' if r < 0.85 else 'tall_grass_clump', x, z, rnd.uniform(0, 6), rnd.uniform(0.85, 1.1))

# ── 풍차 (뒤쪽 높은 층, 위 가운데와 오른쪽 집 사이 뒤)
add('wooden_windmill', 8.0, -25.0, 0.3, 1.0)
# 위층 집 사이 소품
add('wooden_barrel', -7.4, -13.6, 0, 1.0); add('wooden_crate', 7.6, -13.2, 0.4, 1.0); add('wooden_barrel', 22.4, -13.6, 0, 1.0)

# ── 나무: 뒤 숲(높은 층) · 양옆 · 앞쪽 숲
for i, x in enumerate(range(-35, 37, 4)):
    if abs(x - 8) < 3: continue   # 풍차 자리
    add('apple_tree' if i % 3 == 0 else 'fir_tree', x + rnd.uniform(-0.7, 0.7), -25.0 + rnd.uniform(-0.5, 0.4), rnd.uniform(0, 6), rnd.uniform(1.0, 1.2))
for x, z, a in [(-35.2, -12.5, 'apple_tree'), (-35.4, -3.5, 'fir_tree'), (-35.2, 7.0, 'apple_tree'), (-35.0, 15.5, 'fir_tree'),
                (35.2, -3.0, 'fir_tree'), (35.0, 3.5, 'apple_tree'), (34.8, 12.6, 'fir_tree'),
                (-31.5, 20.2, 'apple_tree'), (-27.0, 21.0, 'fir_tree'), (-12.5, 21.0, 'fir_tree'), (-6.5, 20.4, 'apple_tree'),
                (10.5, 21.0, 'fir_tree'), (16.5, 20.4, 'fir_tree'), (22.5, 21.0, 'apple_tree'), (28.5, 20.6, 'fir_tree'), (34.0, 20.2, 'fir_tree'),
                (-21.5, -12.4, 'apple_tree'), (-7.4, -18.2, 'fir_tree'), (7.6, -18.0, 'apple_tree'), (22.6, -18.4, 'apple_tree'),
                (-31.5, -3.0, 'apple_tree'), (31.5, -2.6, 'apple_tree')]:
    add(a, x, z, rnd.uniform(0, 6), rnd.uniform(1.0, 1.15))
for x, z, s in [(30.5, 18.8, 1.3), (13.8, 20.4, 1.1), (-9.0, 21.0, 1.2), (-33.8, 11.0, 1.0), (34.6, -20.4, 1.1), (-1.0, 20.6, 1.0), (21.0, 13.0, 0.9)]:
    add('large_boulder', x, z, rnd.uniform(0, 6), s)

layout = {'version': 1,
          'terrain': {'lines': [
              {'z': Z_BACK, 'above': round(3 * STEP, 3), 'below': round(2 * STEP, 3), 'stairs': [], 'ramp': 1.6},
              {'z': Z_A, 'above': round(2 * STEP, 3), 'below': round(STEP, 3), 'stairs': [{'x': x, 'w': 3.6} for x in STAIR_A], 'ramp': 1.6},
              {'z': Z_B, 'above': round(STEP, 3), 'below': 0.0, 'stairs': [{'x': x, 'w': 3.6} for x in STAIR_B], 'ramp': 1.6}]},
          'places': places, 'paths': [], 'randomDecor': False, 'props': props, 'roads': roads, 'plazas': plazas,
          'ground': old.get('ground') or {'grass': 'tex_grass.jpg', 'path': 'tex_clay_path.jpg', 'plaza': 'tex_plaza_cobble.jpg', 'paw': 'tex_paw_tile.png'}}
json.dump(layout, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('props', len(props), 'roads', len(roads))
