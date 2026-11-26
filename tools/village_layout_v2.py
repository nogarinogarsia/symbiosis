# 키아트 v2(새 마을) 배치 → assets/map-layout.json
# 실행: python tools/village_layout_v2.py assets/map-layout.json assets/map-layout.json
# 화면 위쪽 = -z. 맵 범위 x -36~36, z -26~22. 높낮이(계단식)는 평지 위 돌 축대·계단 장식으로 표현.
import json, math, sys, random
SRC, OUT = sys.argv[1], sys.argv[2]
old = json.load(open(SRC, encoding='utf-8'))
rnd = random.Random(2026)

GW, GD = 11, 12            # 마당 크기 (우리집·이웃 같은 크기)
HOME = (27.0, 2.0)          # 오른쪽 가운데 빨간 기와 오두막 = 우리집
NEIGH = [                   # 이웃 5집 (키아트: 위 3채 + 왼쪽 1채, 5번째는 맨 왼쪽 위)
    {'x': -29.5, 'z': -17.0, 'house': 'green_hip_cottage'},
    {'x': -15.5, 'z': -17.0, 'house': 'red_hip_cottage_2'},
    {'x': -1.0,  'z': -18.0, 'house': 'red_timber_cottage'},
    {'x': 14.0,  'z': -17.0, 'house': 'green_hip_cottage'},
    {'x': -28.0, 'z': 1.5,   'house': 'green_timber_cottage'},
]
PLAZA = (2.0, 2.0); PR = 7.5

places = {
    'home': {'x': HOME[0], 'z': HOME[1], 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'house': 'red_hip_cottage'},
    'neighbors': {'x': 0.0, 'z': -17.0, 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': GW, 'gd': GD, 'gap': 3, 'slots': NEIGH},
    'dex': {'x': -12.5, 'z': -1.0, 'model': 'book_library_hut', 'ry': 0, 's': 1},          # 유전 도서관 = 책 도서관
    'breed': {'x': -21.0, 'z': 13.0, 'model': 'cat_shelter_pavilion', 'ry': 0, 's': 1},   # 고양이 쉼터 = 교배 장소
    'shop': {'x': 30.5, 'z': -14.4},                                                       # 동물샵: 키아트에 없어 마을 바깥(오른쪽 위 외곽)으로
    'player': {'x': HOME[0], 'z': HOME[1] + GD / 2 + 1.8},                                 # 우리집 문 앞에서 시작
}

roads = [
    {'pts': [[-36, -9.0], [-24, -9.6], [-10, -8.8], [2, -9.4], [16, -8.8], [36, -9.4]], 'w': 3.0},       # 이웃 집 앞 큰길
    {'pts': [[2, -9.2], [2, -5.2]], 'w': 2.8},                                                         # 큰길 → 광장 (돌 계단)
    {'pts': [[-20.5, -9.2], [-20, -3], [-18.5, 4.5], [-12, 6.6], [-5.6, 4.6]], 'w': 2.8},             # 왼쪽 길 → 광장
    {'pts': [[-12.5, 1.6], [-12.4, 6.4]], 'w': 2.0},                                                   # 도서관 문 → 길
    {'pts': [[-28, 7.4], [-24, 8.6], [-18.6, 6.2]], 'w': 2.2},                                         # 왼쪽 이웃집 문 → 길
    {'pts': [[9.4, 3.4], [15, 5.6], [21.5, 9.4], [27, 9.8], [35.5, 9.2]], 'w': 2.8},                  # 광장 → 우리집
    {'pts': [[2.6, 9.4], [3.4, 15], [4.2, 22]], 'w': 3.0},                                             # 광장 → 아래 입구 (돌 계단)
    {'pts': [[3.2, 14.0], [-5, 16.0], [-13, 18.0], [-21, 18.6]], 'w': 2.4},                            # 아래 길 → 고양이 쉼터
    {'pts': [[30.5, -11.9], [30.5, -9.4]], 'w': 2.0},                                                  # 동물샵 문 → 큰길
]
for q in NEIGH[:4]:                                                                                     # 위쪽 이웃 마당 문 → 큰길
    roads.append({'pts': [[q['x'], q['z'] + GD / 2 - 0.2], [q['x'], -9.2]], 'w': 1.8})

plazas = [
    {'x': PLAZA[0], 'z': PLAZA[1], 'r': PR, 'kind': 'stone'},          # 광장 돌바닥 (자갈 텍스처)
    {'x': PLAZA[0] + 0.2, 'z': PLAZA[1] + 6.0, 'r': 1.1, 'kind': 'paw'},  # 발바닥 돌 타일
]

props = []
def add(a, x, z, ry=0.0, s=1.0):
    props.append({'asset': a, 'x': round(x, 2), 'z': round(z, 2), 'ry': round(ry % (2 * math.pi), 3), 's': round(s, 2)})
face = lambda x, z, tx, tz: math.atan2(tx - x, tz - z)

# ── 마당 안: 문 → 집 디딤돌 + 꽃 (키아트의 정원)
for cx, cz in [HOME] + [(q['x'], q['z']) for q in NEIGH]:
    front = cz + GD / 2
    for k, dz in enumerate((1.3, 2.6, 3.9)):
        add('gray_stepping_stone', cx + (0.35 if k % 2 else -0.2), front - dz, rnd.uniform(0, 6), 1.0)
    add('red_flower_bush', cx - GW / 2 + 1.6, front - 1.6, 0, 0.9)
    add('white_flower_bush', cx + GW / 2 - 1.6, front - 1.8, 0, 0.9)
    add('tall_grass_clump', cx - GW / 2 + 1.4, cz - 0.5, 0, 1.0)

# ── 공용 광장: 큰 나무(화단·벤치 포함) · 벤치 · 고양이 동상 · 화분 상자 · 가로등
add('plaza_great_tree', PLAZA[0], PLAZA[1] - 0.6, 0, 1.0)
for bx, bz in [(PLAZA[0] - 4.6, PLAZA[1] + 3.6), (PLAZA[0] + 4.8, PLAZA[1] + 3.4)]:
    add('wood_slat_bench', bx, bz, face(bx, bz, *PLAZA), 1.0)
add('cat_statue_pedestal', PLAZA[0] - 2.2, PLAZA[1] + 4.4, 0, 1.6)
for fx, fz in [(PLAZA[0] - 2.4, PLAZA[1] + 6.4), (PLAZA[0] + 4.6, PLAZA[1] + 5.9), (PLAZA[0] - 5.8, PLAZA[1] - 2.0)]:
    add('flower_planter_box', fx, fz, face(fx, fz, *PLAZA), 1.0)
for lx, lz in [(PLAZA[0] - 6.6, PLAZA[1] + 4.6), (PLAZA[0] + 6.8, PLAZA[1] - 3.6), (PLAZA[0] + 6.6, PLAZA[1] + 4.8), (PLAZA[0] - 6.4, PLAZA[1] - 4.4)]:
    add('wood_lantern_post', lx, lz, 0, 1.0)

# ── 마을 게시판 (광장 오른쪽) + 화분
add('village_notice_board', 12.8, -1.6, 0, 1.0)
for fx in (10.4, 15.2): add('flower_pot', fx, 0.2, 0, 1.0)
add('wood_lantern_post', 16.6, -2.2, 0, 1.0)

# ── 유전 도서관 주변
for fx, fz in [(-16.2, 1.6), (-8.8, 1.8)]: add('flower_pot', fx, fz, 0, 1.0)
add('wood_lantern_post', -9.0, -3.2, 0, 1.0)

# ── 고양이 쉼터 (왼쪽 아래) 소품
B = places['breed']
add('cat_face_signboard', B['x'] - 4.2, B['z'] + 2.4, 0.25, 1.6)
add('cat_food_bowl_table', B['x'] - 2.8, B['z'] + 4.0, 0, 1.6)
add('cat_scratch_post', B['x'] + 4.0, B['z'] + 1.2, 0, 1.6)
add('hollow_log_tunnel', B['x'] + 6.6, B['z'] + 0.2, 0.35, 1.4)
for sx, sz in [(B['x'] + 3.6, B['z'] + 3.4), (B['x'] + 5.6, B['z'] + 3.0), (B['x'] - 5.4, B['z'] - 0.6)]:
    add('tree_stump_seat', sx, sz, rnd.uniform(0, 6), 1.3)
add('wood_slat_bench', B['x'] - 0.4, B['z'] + 7.6, math.pi, 1.0)
add('cat_cushion_basket', B['x'] + 3.4, B['z'] + 2.0, 0, 1.5)
add('red_flower_bush', B['x'] + 8.6, B['z'] + 2.4, 0, 1.0)
add('white_flower_bush', B['x'] - 6.4, B['z'] + 3.8, 0, 1.0)

# ── 계단식 지형 표현: 돌 축대 줄 + 길이 지나가는 곳에 계단
WALL = 2.406 * 2.4 * 0.6   # 축대 한 칸 길이(게임 단위)
def wall_line(z, x0, x1, gaps, steps_at):
    x = x0
    while x + WALL / 2 <= x1:
        cx = x + WALL / 2
        if not any(g0 - WALL / 2 < cx < g1 + WALL / 2 for g0, g1 in gaps): add('stone_retaining_wall', cx, z, 0, 1.0)
        x += WALL
    for sx in steps_at: add('stone_wood_steps', sx, z, 0, 1.0)
wall_line(-6.4, -36, 36, gaps=[(-22.3, -18.3), (0.2, 3.8)] + [(q['x'] - 1, q['x'] + 1) for q in []], steps_at=[2.0, -20.2])
wall_line(11.4, -36, 36, gaps=[(1.4, 5.6)], steps_at=[3.4])

# ── 풍차 (위쪽, 이웃 집 사이 뒤편)
add('wooden_windmill', 6.8, -23.2, 0.3, 1.0)

# ── 나무: 위쪽 숲 · 양 가장자리 · 아래 숲 (전나무 + 사과나무)
for i, x in enumerate(range(-34, 37, 5)):
    add('fir_tree' if i % 2 else 'apple_tree', x + rnd.uniform(-0.8, 0.8), -24.8 + rnd.uniform(-0.4, 0.6), rnd.uniform(0, 6), rnd.uniform(0.95, 1.15))
for x, z, a in [(-35, -4.0, 'fir_tree'), (-35.4, 13.4, 'fir_tree'), (-31, 19.5, 'apple_tree'), (-26, 21, 'fir_tree'), (-12, 21, 'fir_tree'),
                (-6, 19.6, 'apple_tree'), (11, 21.2, 'fir_tree'), (17, 20.6, 'fir_tree'), (31, 20.4, 'fir_tree'), (35.2, 16, 'apple_tree'),
                (35.4, -4, 'fir_tree'), (35.2, -19.5, 'apple_tree'), (21.5, -4.8, 'apple_tree'), (-7.6, -4.8, 'apple_tree'), (-34.5, -12.5, 'apple_tree'),
                (8.0, -12.6, 'apple_tree'), (-8.4, -12.8, 'fir_tree'), (20.6, -12.6, 'fir_tree')]:
    add(a, x, z, rnd.uniform(0, 6), rnd.uniform(0.95, 1.15))

# ── 바위 · 덤불 · 꽃 · 풀 (가장자리와 길가)
for x, z, s in [(32.8, -2.2, 1.1), (-33.8, 9.0, 1.0), (9.0, 20.0, 1.2), (29.0, 20.2, 1.0), (-15.6, 20.8, 1.1), (18.6, 13.8, 0.9)]:
    add('large_boulder', x, z, rnd.uniform(0, 6), s)
for x, z in [(12.0, 14.0), (-2.0, 20.0), (26.0, -4.8), (-22.6, -4.4), (34.0, 6.0)]:
    add('small_rock', x, z, rnd.uniform(0, 6), 1.0)
for x, z, a in [(-4.6, -4.2, 'red_flower_bush'), (8.2, -4.6, 'white_flower_bush'), (19.0, -4.4, 'red_flower_bush'), (-17.0, -4.6, 'green_round_bush'),
                (-30.5, -4.8, 'green_round_bush'), (10.5, 9.0, 'red_flower_bush'), (-6.4, 9.6, 'white_flower_bush'), (15.6, 8.6, 'green_round_bush'),
                (-1.0, 13.6, 'red_flower_bush'), (8.6, 15.4, 'white_flower_bush'), (21.0, 13.0, 'red_flower_bush'), (33.8, 12.6, 'green_round_bush'),
                (-33.0, 15.0, 'red_flower_bush'), (-10.0, 12.8, 'green_round_bush'), (-24.4, -5.0, 'green_round_bush'), (25.0, -5.0, 'green_round_bush')]:
    add(a, x, z, rnd.uniform(0, 6), 1.0)
for x, z in [(-3, 12.8), (12, 13.0), (-14, 9.8), (30, -5.0), (-36 + 1.5, 3.0), (6.0, -5.0), (-11.0, -5.0), (24.0, 21.0)]:
    add('tall_grass_clump', x, z, rnd.uniform(0, 6), 1.0)
# 장식 소품
add('wooden_barrel', -21.6, -2.6, 0, 1.0); add('wooden_crate', -21.4, -0.8, 0.4, 1.0)
add('wooden_barrel', 20.6, 13.2, 0, 1.0); add('wooden_crate', 27.6, 18.6, 0.3, 1.0); add('wooden_crate', 28.6, 18.0, 1.0, 1.0)

# 계단식 지형: 위(이웃 집 층) 2단, 가운데(광장·우리집 층) 1단, 아래(쉼터 층) 0. 한 단 = 돌 축대 높이
STEP = 0.6 * 2.4 * 0.6
terrain = {'lines': [
    {'z': -6.4, 'above': round(2 * STEP, 3), 'below': round(STEP, 3), 'stairs': [{'x': 2.0, 'w': 3.4}, {'x': -20.2, 'w': 3.4}]},
    {'z': 11.4, 'above': round(STEP, 3), 'below': 0.0, 'stairs': [{'x': 3.4, 'w': 3.4}]},
]}
layout = {'version': 1, 'terrain': terrain, 'places': places, 'paths': [], 'randomDecor': False, 'props': props, 'roads': roads, 'plazas': plazas,
          'ground': old.get('ground') or {'grass': 'tex_grass.jpg', 'path': 'tex_clay_path.jpg', 'plaza': 'tex_plaza_cobble.jpg', 'paw': 'tex_paw_tile.png'}}
json.dump(layout, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('props', len(props), 'roads', len(roads), 'plazas', len(plazas))
