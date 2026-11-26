# 키아트 v2 실측 배치 → assets/map-layout.json
# 실행: python tools/village_layout_v4.py <이전 배치.json> assets/map-layout.json
# 키아트(2000×1125) 속 건물 바닥 위치를 원근을 감안해 맵 좌표로 옮긴 값(×1.35, 광장 중심 = (0.5, 2)).
# 회전(ry, 라디안): +면 정면이 오른쪽(+x)으로, -면 왼쪽으로 돌아감. 키아트처럼 광장 쪽을 바라보게.
import json, math, sys, random
SRC, OUT = sys.argv[1], sys.argv[2]
old = json.load(open(SRC, encoding='utf-8'))
rnd = random.Random(11)

STEP = 0.6 * 2.4 * 0.6 * 1.5; WALL_S = 1.5; WALL = 2.406 * 2.4 * 0.6 * WALL_S
GW, GD = 11, 10

# ── 건물 (키아트 실측)
HOME = {'x': 21.0, 'z': 4.0, 'ry': -0.45}                                          # 오른쪽 빨간 기와 = 우리집 (광장 쪽으로)
NEIGH = [
    {'x': -12.8, 'z': -21.0, 'house': 'red_hip_cottage_2',   'ry': 0.35},           # 위 왼쪽 빨간 기와
    {'x': 1.5,   'z': -24.0, 'house': 'red_timber_cottage',  'ry': 0.0},            # 위 가운데 빨간 목조
    {'x': 19.6,  'z': -20.5, 'house': 'green_hip_cottage',   'ry': -0.35},          # 위 오른쪽 초록 기와
    {'x': -20.0, 'z': 2.0,   'house': 'green_timber_cottage','ry': 0.45},           # 왼쪽 초록 목조
    {'x': -29.0, 'z': -21.0, 'house': 'red_timber_cottage',  'ry': 0.3},            # (키아트 밖) 맨 왼쪽 위
]
PLAZA = (0.5, 2.0); PR = 9.5
LIB = {'x': -8.8, 'z': 0.0, 'ry': 0.12}
BOARD = {'x': 8.8, 'z': 1.2, 'ry': -0.12}
SHELTER = {'x': -16.0, 'z': 19.5, 'ry': 0.25}
SHOP = {'x': 33.5, 'z': -21.0}

# ── 지형 경계선 (키아트: 위 집들 아래 축대, 광장·왼쪽 집 아래 축대는 왼쪽이 높고 오른쪽이 낮게 휘어짐)
LINE_BACK = [[-40, -29.6], [40, -29.6]]
LINE_A = [[-40, -12.4], [0, -12.5], [40, -12.1]]
LINE_B = [[-40, 9.6], [-24, 9.8], [-12, 12.2], [0, 13.6], [8, 14.2], [16, 14.6], [40, 15.2]]
STAIR_A = [1.5, 11.3]; STAIR_B = [3.0, 13.6]

def z_on(line, x):
    P = sorted(line)
    if x <= P[0][0]: return P[0][1]
    for (x0, z0), (x1, z1) in zip(P, P[1:]):
        if x <= x1: return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return P[-1][1]

places = {
    'home': {'x': HOME['x'], 'z': HOME['z'], 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'house': 'red_hip_cottage', 'hry': HOME['ry']},
    'neighbors': {'x': 0.0, 'z': -20.0, 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'gap': 3,
                  'slots': [{'x': q['x'], 'z': q['z'], 'house': q['house'], 'ry': q['ry']} for q in NEIGH]},
    'dex': {'x': LIB['x'], 'z': LIB['z'], 'model': 'book_library_hut', 'ry': LIB['ry'], 's': 1},
    'breed': {'x': SHELTER['x'], 'z': SHELTER['z'], 'model': 'cat_shelter_pavilion', 'ry': SHELTER['ry'], 's': 1},
    'shop': {'x': SHOP['x'], 'z': SHOP['z']},
    'player': {'x': HOME['x'], 'z': HOME['z'] + GD / 2 + 1.6},
}

# ── 흙길 (키아트: 광장 둘레 고리 + 위 오솔길 + 계단 세 곳 + 아래층 갈래). 광장으로 가는 길은 끝을 광장 안까지 넣어 틈이 없게
roads = [
    {'pts': [[-34, -13.9], [-20, -14.0], [-6, -13.8], [8, -13.9], [22, -13.8], [34, -13.9]], 'w': 1.8},   # 위층 오솔길 (축대 위)
    {'pts': [[1.5, -13.8], [1.5, -11.0], [1.2, -6.0]], 'w': 2.4},                                       # 가운데 계단 → 광장
    {'pts': [[11.3, -13.8], [11.4, -11.0], [12.6, -4.0], [13.6, 3.0], [14.2, 8.6]], 'w': 2.4},           # 오른쪽 계단 → 게시판 옆 → 우리집 길
    {'pts': [[-20.0, 7.3], [-15.0, 9.4], [-9.4, 8.6], [-6.6, 6.6]], 'w': 2.4},                                        # 왼쪽 집 → 광장
    {'pts': [[7.4, 4.8], [9.4, 5.8], [14.2, 8.6], [21.0, 10.4], [28.0, 10.6], [40, 10.2]], 'w': 2.4},                # 광장 → 우리집 → 오른쪽
    {'pts': [[3.0, 9.8], [3.0, 13.6], [3.2, 16.4]], 'w': 2.6},                                          # 아래 계단 (광장 → 아래층)
    {'pts': [[14.2, 9.6], [13.6, 12.0], [13.6, 14.4], [14.2, 17.4]], 'w': 2.2},                         # 오른쪽 아래 계단
    {'pts': [[3.2, 16.4], [-4.0, 18.8], [-10.0, 22.0], [-14.0, 23.8]], 'w': 2.4},                        # 아래층 → 고양이 쉼터
    {'pts': [[3.6, 16.6], [4.4, 21.0], [4.2, 27.0]], 'w': 2.6},                                          # 아래층 → 마을 입구
    {'pts': [[3.8, 16.4], [14.2, 17.4], [24.0, 20.0], [40, 21.0]], 'w': 2.4},                            # 아래층 → 오른쪽
    {'pts': [[SHOP['x'], SHOP['z'] + 2.6], [SHOP['x'], -13.9]], 'w': 1.8},                               # 동물샵 → 오솔길
]
for q in NEIGH:
    if q['z'] < -5: roads.append({'pts': [[q['x'], q['z'] + GD / 2 - 0.2], [q['x'], -13.9]], 'w': 1.6})

plazas = [{'x': PLAZA[0], 'z': PLAZA[1], 'r': PR, 'kind': 'stone'},
          {'x': 0.9, 'z': 8.8, 'r': 1.0, 'kind': 'paw'}]

props = []
def add(a, x, z, ry=0.0, s=1.0):
    props.append({'asset': a, 'x': round(x, 2), 'z': round(z, 2), 'ry': round(ry % (2 * math.pi), 3), 's': round(s, 2)})
face = lambda x, z, tx, tz: math.atan2(tx - x, tz - z)
def near_road(x, z, pad=1.2):
    for r in roads:
        for (x0, z0), (x1, z1) in zip(r['pts'], r['pts'][1:]):
            L = math.hypot(x1 - x0, z1 - z0) or 1; t = max(0, min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / L ** 2))
            if math.hypot(x - (x0 + t * (x1 - x0)), z - (z0 + t * (z1 - z0))) < r['w'] / 2 + pad: return True
    return False
YARDS = [(HOME['x'], HOME['z'])] + [(q['x'], q['z']) for q in NEIGH]
in_yard = lambda x, z, pad=0.5: any(abs(x - cx) < GW / 2 + pad and abs(z - cz) < GD / 2 + pad for cx, cz in YARDS)

# ── 마당: 디딤돌, 울타리 안 꽃밭, 풀, 화분/나무통
for cx, cz in YARDS:
    front = cz + GD / 2
    for k, dz in enumerate((1.1, 2.2, 3.3)):
        add('gray_stepping_stone', cx + (0.3 if k % 2 else -0.15), front - dz, rnd.uniform(0, 6), 1.0)
    for x, a in [(cx - GW / 2 + 1.2, 'red_flower_bush'), (cx - GW / 2 + 2.7, 'white_flower_bush'), (cx + GW / 2 - 1.2, 'red_flower_bush'), (cx + GW / 2 - 2.7, 'red_flower_bush')]:
        add(a, x, front - 1.3, rnd.uniform(0, 6), 0.95)
    add('tall_grass_clump', cx - GW / 2 + 1.2, cz - 1.4, 0, 1.1)
add('wooden_barrel', NEIGH[3]['x'] - 4.0, NEIGH[3]['z'] - 0.5, 0, 1.0)      # 키아트: 왼쪽 초록 집 옆 나무통
add('wooden_barrel', NEIGH[0]['x'] + 4.2, NEIGH[0]['z'] - 1.4, 0, 1.0)      # 위 왼쪽 집 옆 나무통

# ── 공용 광장 (키아트 실측)
add('plaza_great_tree', PLAZA[0], 0.5, 0, 1.05)
add('wood_slat_bench', -6.3, 5.9, face(-6.3, 5.9, PLAZA[0], 0.5), 1.0)
add('wood_slat_bench', 6.5, 5.9, face(6.5, 5.9, PLAZA[0], 0.5), 1.0)
add('cat_statue_pedestal', -4.2, 5.4, 0.3, 1.6)
add('flower_planter_box', -3.6, 8.2, face(-3.6, 8.2, *PLAZA), 1.0)
add('flower_planter_box', 4.6, 8.4, face(4.6, 8.4, *PLAZA), 1.0)
# 도서관·게시판 옆 등불과 화분
add('wood_lantern_post', LIB['x'] - 3.9, LIB['z'] + 1.0, 0, 1.0)
add('wood_lantern_post', BOARD['x'] - 3.3, BOARD['z'] - 0.8, 0, 1.0)
add('village_notice_board', BOARD['x'], BOARD['z'], BOARD['ry'], 1.3)   # 키아트: 도서관 높이의 약 70%
for fx, fz in [(LIB['x'] - 3.0, LIB['z'] + 3.4), (LIB['x'] + 3.2, LIB['z'] + 3.2), (BOARD['x'] - 2.8, BOARD['z'] + 2.4), (BOARD['x'] + 2.8, BOARD['z'] + 2.2)]:
    add('flower_pot', fx, fz, 0, 1.0)
for fx, fz in [(LIB['x'] - 3.2, LIB['z'] - 2.2), (BOARD['x'] + 3.0, BOARD['z'] - 2.0)]:
    add('red_flower_bush', fx, fz, rnd.uniform(0, 6), 0.9)

# ── 고양이 쉼터 (키아트 실측 상대 위치, 0.85배로 조금 모음)
S = SHELTER
def sadd(a, dx, dz, ry=0.0, s=1.0): add(a, S['x'] + dx * 0.85, S['z'] + dz * 0.85, ry, s)
sadd('cat_face_signboard', -4.6, 3.6, 0.25, 1.6)
sadd('flower_pot', -2.8, 5.4, 0, 1.0)
sadd('cat_food_bowl_table', 1.2, 5.6, 0, 1.6)
sadd('wood_slat_bench', 3.0, 7.6, 0, 1.0)
sadd('cat_scratch_post', 6.8, 1.6, 0, 1.6)
sadd('hollow_log_tunnel', 11.0, -0.4, 0.3, 1.4)
for dx, dz in [(5.0, 3.6), (9.4, 7.0), (11.4, 5.6), (-5.2, -1.4)]:
    sadd('tree_stump_seat', dx, dz, rnd.uniform(0, 6), 1.3)
sadd('cat_cushion_basket', 2.6, 2.6, 0, 1.5)
sadd('red_flower_bush', 13.6, 3.0, 0, 1.0); sadd('red_flower_bush', 8.0, 9.6, 0, 1.0); sadd('white_flower_bush', 14.4, 8.0, 0, 1.0)
for i in range(11):   # 쉼터 마당 둘레 작은 돌 테두리 (키아트)
    a = math.pi * (0.12 + 0.76 * i / 10); add('small_rock', S['x'] + 6.5 + math.cos(a) * 12.0, S['z'] + 3.4 + math.sin(a) * 5.0, rnd.uniform(0, 6), 1.0)

# ── 돌 축대(꺾인 경계선을 따라 회전) + 계단
def wall_along(line, stairs):
    P = sorted(line); pts = []
    for (x0, z0), (x1, z1) in zip(P, P[1:]):
        L = math.hypot(x1 - x0, z1 - z0); n = max(1, round(L / WALL))
        for i in range(n):
            t = (i + 0.5) / n; x = x0 + (x1 - x0) * t; z = z0 + (z1 - z0) * t
            if any(abs(x - sx) < WALL / 2 + 1.6 for sx in stairs): continue
            add('stone_retaining_wall', x, z, math.atan2(-(z1 - z0), x1 - x0), WALL_S)
    for sx in stairs: add('stone_wood_steps', sx, z_on(line, sx), 0, WALL_S)
wall_along(LINE_BACK, []); wall_along(LINE_A, STAIR_A); wall_along(LINE_B, STAIR_B)

# ── 축대 따라 꽃밭 (위아래 모두, 키아트처럼 촘촘히)
for line, offs in [(LINE_A, (1.3,)), (LINE_B, (-1.3, 1.5)), (LINE_BACK, (1.3,))]:
    for off in offs:
        for x in range(-38, 39, 2):
            x = x + rnd.uniform(-0.5, 0.5); z = z_on(line, x) + off + rnd.uniform(-0.3, 0.3)
            if near_road(x, z, 0.7) or in_yard(x, z) or math.hypot(x - PLAZA[0], z - PLAZA[1]) < PR + 0.8: continue
            if abs(x - SHOP['x']) < 4.2 and abs(z - SHOP['z']) < 3.4: continue
            r = rnd.random()
            add('red_flower_bush' if r < 0.45 else 'white_flower_bush' if r < 0.68 else 'green_round_bush' if r < 0.84 else 'tall_grass_clump', x, z, rnd.uniform(0, 6), rnd.uniform(0.85, 1.1))

# ── 풍차 (뒤쪽 높은 층, 위 가운데·오른쪽 집 사이 뒤)
add('wooden_windmill', 13.0, -31.4, 0.3, 1.0)

# ── 숲: 뒤(높은 층) · 양옆 · 앞
for i, x in enumerate(range(-39, 40, 4)):
    if abs(x - 13) < 3: continue
    add('apple_tree' if i % 3 == 0 else 'fir_tree', x + rnd.uniform(-0.6, 0.6), -32.0 + rnd.uniform(-0.6, 0.6), rnd.uniform(0, 6), rnd.uniform(1.0, 1.2))
for x, z, a in [(-24.0, -24.6, 'apple_tree'), (-5.8, -26.4, 'fir_tree'), (8.6, -26.2, 'apple_tree'), (27.2, -25.4, 'apple_tree'), (-36.5, -22.0, 'fir_tree'),
                (-38.0, -6.0, 'fir_tree'), (-37.4, 2.0, 'apple_tree'), (-29.0, -4.0, 'apple_tree'), (-38.2, 14.0, 'fir_tree'),
                (38.2, -5.0, 'fir_tree'), (31.0, -1.0, 'apple_tree'), (37.4, 4.0, 'fir_tree'), (36.6, 13.0, 'apple_tree'),
                (-35.0, 25.0, 'fir_tree'), (-27.0, 25.4, 'apple_tree'), (-6.5, 25.6, 'fir_tree'), (11.5, 25.0, 'fir_tree'),
                (18.0, 24.0, 'fir_tree'), (27.0, 25.4, 'fir_tree'), (33.0, 24.8, 'apple_tree'), (38.0, 22.0, 'fir_tree'), (-31.0, 17.0, 'apple_tree')]:
    add(a, x, z, rnd.uniform(0, 6), rnd.uniform(1.0, 1.15))
for x, z, s in [(30.0, 22.0, 1.3), (20.4, 23.6, 1.1), (-1.6, 25.0, 1.1), (-22.0, 25.6, 1.0), (37.2, -12.0, 1.0), (-37.6, 8.0, 1.0), (24.4, 13.0, 0.9)]:
    add('large_boulder', x, z, rnd.uniform(0, 6), s)

layout = {'version': 1,
          'terrain': {'lines': [
              {'pts': LINE_BACK, 'z': -29.6, 'above': round(3 * STEP, 3), 'below': round(2 * STEP, 3), 'stairs': [], 'ramp': 1.6},
              {'pts': LINE_A, 'z': -12.3, 'above': round(2 * STEP, 3), 'below': round(STEP, 3), 'stairs': [{'x': x, 'w': 3.6} for x in STAIR_A], 'ramp': 1.6},
              {'pts': LINE_B, 'z': 13, 'above': round(STEP, 3), 'below': 0.0, 'stairs': [{'x': x, 'w': 3.6} for x in STAIR_B], 'ramp': 1.6}]},
          'places': places, 'paths': [], 'randomDecor': False, 'props': props, 'roads': roads, 'plazas': plazas,
          'ground': old.get('ground') or {'grass': 'tex_grass.jpg', 'path': 'tex_clay_path.jpg', 'plaza': 'tex_plaza_cobble.jpg', 'paw': 'tex_paw_tile.png'}}
json.dump(layout, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('props', len(props), 'roads', len(roads))
