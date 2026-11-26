# 키아트 v2 윤곽 따라 그리기 → assets/map-layout.json
# 실행: python tools/village_layout_v5.py <이전 배치.json> assets/map-layout.json
# 아래 좌표는 모두 키아트(2000×1125 px) 위에서 잰 픽셀 값이고, A(px,py)가 원근을 감안해 맵 좌표(x,z)로 바꿈.
import json, math, sys, random
SRC, OUT = sys.argv[1], sys.argv[2]
old = json.load(open(SRC, encoding='utf-8'))
rnd = random.Random(5)

K = 1.35 * 0.65   # 키아트 집 너비(≈10칸) ÷ 게임 집 너비(≈6칸) → 간격을 0.65배로 줄여 집·마당·광장 비율을 키아트와 같게
def A(px, py):
    """키아트 픽셀 → 맵 (x, z). 세로: 21px = K칸, 가로: 깊이에 따라 37~54px = K칸"""
    z = (py - 600) / 21 * K + 2.0
    s = 47 + (py - 600) * 0.024
    return [round((px - 1000) / s * K, 2), round(z, 2)]
AP = lambda pts: [A(*p) for p in pts]

STEP = 0.6 * 2.4 * 0.6 * 1.5; WALL_S = 1.5; WALL = 2.406 * 2.4 * 0.6 * WALL_S

# ── 마당 (울타리 윤곽 · 문 · 집 바닥 중심 · 회전)
YARDS = {
    'TL': dict(poly=[(385,190),(400,262),(505,335),(640,325),(745,325),(880,180),(760,140),(540,150)], gate=(692,328), house=(625,180), ry=0.35, model='red_hip_cottage_2'),
    'TC': dict(poly=[(880,180),(840,262),(995,292),(1090,290),(1235,275),(1210,185),(1150,120),(950,120)], gate=(1042,292), house=(1045,147), ry=0.0, model='red_timber_cottage'),
    'TR': dict(poly=[(1210,195),(1280,265),(1350,330),(1450,330),(1600,355),(1810,255),(1820,205),(1720,160),(1430,165)], gate=(1400,330), house=(1575,187), ry=-0.35, model='green_hip_cottage'),
    'L':  dict(poly=[(60,500),(90,565),(180,695),(370,695),(445,690),(615,625),(600,555),(520,495),(420,450),(150,470)], gate=(407,693), house=(310,532), ry=0.25, model='green_timber_cottage'),
    'HOME': dict(poly=[(1460,555),(1350,640),(1500,720),(1575,735),(1900,690),(1905,560),(1800,480),(1560,470)], gate=(1537,728), house=(1710,572), ry=-0.45, model='red_hip_cottage'),
}
def yard(k, w=3.2):
    Y = YARDS[k]; g = A(*Y['gate']); h = A(*Y['house'])
    return {'poly': AP(Y['poly']), 'gate': {'x': g[0], 'z': g[1], 'w': w}, 'hx': h[0], 'hz': h[1], 'ry': Y['ry'], 'house': Y['model']}

slots = []
for k in ('TL', 'TC', 'TR', 'L'):
    y = yard(k); c = [sum(p[0] for p in y['poly']) / len(y['poly']), sum(p[1] for p in y['poly']) / len(y['poly'])]
    slots.append({'x': round(c[0], 2), 'z': round(c[1], 2), 'house': y['house'], 'ry': y['ry'], 'poly': y['poly'], 'gate': y['gate'], 'hx': y['hx'], 'hz': y['hz']})
N5 = A(-260, 150); slots.append({'x': N5[0], 'z': N5[1], 'house': 'red_timber_cottage', 'ry': 0.3})     # 5번째 이웃 (키아트 밖, 기본 둥근 마당)
H = yard('HOME')
hc = [sum(p[0] for p in H['poly']) / len(H['poly']), sum(p[1] for p in H['poly']) / len(H['poly'])]

LIB = A(712, 500) + [0.1]; BOARD = A(1290, 560) + [-0.1]; SHELTER = A(320, 888) + [0.2]
SHOP = A(2230, 640)

places = {
    'home': {'x': round(hc[0], 2), 'z': round(hc[1], 2), 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': 11, 'gd': 10,
             'house': H['house'], 'hry': H['ry'], 'poly': H['poly'], 'gate': H['gate'], 'hx': H['hx'], 'hz': H['hz']},
    'neighbors': {'x': 0.0, 'z': -20.0, 'fence': 'wood_picket_fence', 'style': 'garden', 'gw': 11, 'gd': 10, 'gap': 3, 'slots': slots},
    'dex': {'x': LIB[0], 'z': LIB[1], 'model': 'book_library_hut', 'ry': LIB[2], 's': 1},
    'breed': {'x': SHELTER[0], 'z': SHELTER[1], 'model': 'cat_shelter_pavilion', 'ry': SHELTER[2], 's': 1},
    'shop': {'x': SHOP[0], 'z': SHOP[1]},
    'player': {'x': H['gate']['x'] - 1.0, 'z': H['gate']['z'] + 2.2},
}

# ── 지형 경계 (키아트 축대·절벽 윤곽)
LINE_BACK = AP([(0,95),(500,85),(900,75),(1300,65),(2000,95)])
LINE_A = AP([(0,360),(380,345),(520,355),(700,345),(1000,310),(1250,300),(1330,370),(1430,405),(1900,410),(2000,420)])
LINE_B = AP([(0,700),(180,710),(420,745),(700,765),(1000,800),(1100,850),(1200,860),(1400,900),(2000,905)])
# 위 고리 길(py≈340)은 위층에 있음 → 축대는 그 길 아래(광장 쪽)로 2.6칸
LINE_A = [[x, round(z + 72 / 21 * K, 2)] if x < A(1300, 340)[0] else [x, z] for x, z in LINE_A]
# 왼쪽 집 문 앞 길(py≈700~745)도 위층 → 왼쪽 아래 축대를 50px 아래로
LINE_B = [[x, round(z + 50 / 21 * K, 2)] if x < A(1000, 800)[0] else [x, z] for x, z in LINE_B]
# 맵 가장자리까지 늘림
for L in (LINE_BACK, LINE_A, LINE_B):
    L.insert(0, [-41.0, L[0][1]]); L.append([41.0, L[-1][1]])
STAIRS_A = [A(695, 345)[0], A(1040, 308)[0], A(1375, 385)[0]]   # 위 왼쪽 집 문 · 위 가운데(나무 뒤) · 오른쪽 계단
STAIRS_B = [A(1120, 850)[0]]                                       # 광장 아래 계단

def z_on(line, x):
    P = sorted(line)
    if x <= P[0][0]: return P[0][1]
    for (x0, z0), (x1, z1) in zip(P, P[1:]):
        if x <= x1: return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return P[-1][1]

# ── 흙길 (키아트 흙길 윤곽)
roads = [
    {'pts': AP([(690,340),(820,345),(1000,335),(1200,330),(1345,362)]), 'w': 2.4},             # 도서관·나무 뒤 고리 길 (위)
    {'pts': AP([(690,340),(560,420),(505,520),(530,620),(600,690)]), 'w': 2.6},                # 고리 길 왼쪽 (도서관 왼쪽)
    {'pts': AP([(1395,410),(1455,480),(1470,560),(1425,650),(1330,760),(1200,815)]), 'w': 2.6},  # 고리 길 오른쪽 (우리집 마당 옆)
    {'pts': AP([(407,700),(480,722),(600,700)]), 'w': 2.2},                                     # 왼쪽 집 문 → 고리 길
    {'pts': AP([(1537,735),(1470,745),(1380,750)]), 'w': 2.0},                                  # 우리집 문 → 고리 길
    {'pts': AP([(1120,815),(1125,860),(1150,920)]), 'w': 2.6},                                  # 광장 아래 계단
    {'pts': AP([(1150,920),(1050,1000),(930,1080),(880,1124)]), 'w': 2.8},                     # 아래층 → 마을 입구
    {'pts': AP([(1060,990),(900,1030),(700,1050),(520,1050)]), 'w': 2.4},                      # 아래층 → 고양이 쉼터 앞
    {'pts': [[A(1537,735)[0] + 1.5, A(1537,735)[1] + 1.2], A(1960, 800), [SHOP[0], SHOP[1] + 4.6]], 'w': 2.0},  # 우리집 → 동물샵 (바깥)
    {'pts': [A(692, 335), A(520, 368), A(330, 362), [N5[0], N5[1] + 5.4]], 'w': 1.8},                # 위층: 왼쪽 위 집 문 → 5번째 이웃
]

PLAZA_C, PLAZA_R = A(990, 620), 7.2
plazas = [{'x': PLAZA_C[0], 'z': PLAZA_C[1], 'r': PLAZA_R, 'kind': 'stone'},
          {'x': A(1030, 705)[0], 'z': A(1030, 705)[1], 'r': 1.0, 'kind': 'paw'}]

props = []
def add(a, x, z, ry=0.0, s=1.0):
    props.append({'asset': a, 'x': round(x, 2), 'z': round(z, 2), 'ry': round(ry % (2 * math.pi), 3), 's': round(s, 2)})
def addp(a, px, py, ry=0.0, s=1.0): p = A(px, py); add(a, p[0], p[1], ry, s)
face = lambda x, z, tx, tz: math.atan2(tx - x, tz - z)
def in_poly(poly, x, z):
    c = False
    for i in range(len(poly)):
        (xi, zi), (xj, zj) = poly[i], poly[i - 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi: c = not c
    return c
POLYS = [s['poly'] for s in slots if 'poly' in s] + [H['poly']]
def near_road(x, z, pad=1.0):
    for r in roads:
        for (x0, z0), (x1, z1) in zip(r['pts'], r['pts'][1:]):
            L = math.hypot(x1 - x0, z1 - z0) or 1; t = max(0, min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / L ** 2))
            if math.hypot(x - (x0 + t * (x1 - x0)), z - (z0 + t * (z1 - z0))) < r['w'] / 2 + pad: return True
    return False

# ── 마당 안 (키아트에서 잰 디딤돌·꽃밭·나무통)
for px, py in [(655,270),(675,295),(690,318), (1040,230),(1040,255),(1040,280), (1420,300),(1395,318),(1460,280),(1480,260),
               (380,600),(395,630),(405,660),(400,690), (1610,690),(1580,710),(1545,725),(1640,670)]:
    addp('gray_stepping_stone', px, py, rnd.uniform(0, 6), 1.0)
for px, py, a in [(450,230,'red_flower_bush'),(520,270,'red_flower_bush'),(560,300,'white_flower_bush'),(800,225,'red_flower_bush'),(840,200,'white_flower_bush'),
                  (900,235,'white_flower_bush'),(960,265,'red_flower_bush'),(1140,260,'red_flower_bush'),(1180,240,'white_flower_bush'),
                  (1290,230,'red_flower_bush'),(1340,250,'red_flower_bush'),(1630,270,'red_flower_bush'),(1700,300,'white_flower_bush'),(1760,280,'red_flower_bush'),
                  (200,600,'white_flower_bush'),(250,640,'red_flower_bush'),(470,620,'red_flower_bush'),(520,600,'white_flower_bush'),(560,640,'red_flower_bush'),
                  (1480,600,'red_flower_bush'),(1520,640,'white_flower_bush'),(1750,690,'red_flower_bush'),(1820,660,'red_flower_bush'),(1650,705,'white_flower_bush')]:
    addp(a, px, py, rnd.uniform(0, 6), 0.95)
addp('wooden_barrel', 760, 205, 0, 1.0); addp('wooden_barrel', 180, 570, 0, 1.0); addp('flower_pot', 395, 560, 0, 1.0); addp('flower_pot', 705, 225, 0, 1.0)

# ── 공용 광장 (키아트 위치)
addp('plaza_great_tree', 1025, 610, 0, 1.0)
for px, py in [(780,660), (1225,660)]:
    p = A(px, py); t = A(1020, 610); add('wood_slat_bench', p[0], p[1], face(p[0], p[1], t[0], t[1]), 1.0)
addp('cat_statue_pedestal', 855, 640, 0.3, 1.0)
addp('flower_planter_box', 870, 730, 0.2, 1.0); addp('flower_planter_box', 1165, 705, -0.2, 1.0)
add('village_notice_board', BOARD[0], BOARD[1], BOARD[2], 1.0)
for px, py in [(610,560),(660,575),(1185,560),(1380,575),(1170,540)]:
    addp('flower_pot', px, py, 0, 1.0)

# ── 고양이 쉼터 (키아트 위치)
addp('cat_face_signboard', 165, 945, 0.2, 1.0); addp('flower_pot', 235, 965, 0, 1.0)
addp('cat_food_bowl_table', 380, 960, 0.1, 1.0); addp('wood_slat_bench', 440, 1000, 0.05, 1.0)
addp('cat_scratch_post', 590, 880, 0, 1.0); addp('hollow_log_tunnel', 770, 860, 0.35, 1.0)
for px, py in [(520,920),(710,985),(770,960),(690,800)]:
    addp('tree_stump_seat', px, py, rnd.uniform(0, 6), 1.0)
for px, py in [(600,1020),(680,1018),(760,1005),(840,980),(910,950),(965,915),(1000,875)]:   # 쉼터 마당 작은 돌 테두리
    addp('small_rock', px, py, rnd.uniform(0, 6), 1.0)
for px, py, a in [(490,820,'red_flower_bush'),(520,860,'red_flower_bush'),(870,880,'red_flower_bush'),(880,920,'red_flower_bush'),(940,820,'red_flower_bush'),
                  (230,960,'red_flower_bush'),(560,1000,'white_flower_bush')]:
    addp(a, px, py, rnd.uniform(0, 6), 1.0)

# ── 축대·계단 (경계선을 따라 회전)
def wall_along(line, stairs, gap=2.0):
    # 경계선을 촘촘히 따라가며 계단(±gap)과 마당 안을 뺀 구간마다 축대를 빈틈없이 이어 붙임
    P = sorted(line); pts = []
    for (x0, z0), (x1, z1) in zip(P, P[1:]):
        n = max(1, int(math.hypot(x1 - x0, z1 - z0) / 0.25))
        pts += [(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n) for i in range(n)]
    pts.append(P[-1])
    free = lambda x, z: abs(x) <= 41 and all(abs(x - sx) >= gap for sx in stairs) and not any(in_poly(q, x, z) for q in POLYS)
    runs, cur = [], []
    for q in pts:
        if free(*q): cur.append(q)
        elif cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    for run in runs:
        d = [0.0]
        for (x0, z0), (x1, z1) in zip(run, run[1:]): d.append(d[-1] + math.hypot(x1 - x0, z1 - z0))
        L = d[-1]
        if L < 0.5: continue
        n = max(1, math.ceil(L / (WALL * 0.95)))
        for i in range(n):
            t = WALL / 2 + (L - WALL) * i / max(1, n - 1) if n > 1 else L / 2
            t = min(max(t, 0), L); j = max(1, next((k for k, v in enumerate(d) if v >= t), len(d) - 1))
            (x0, z0), (x1, z1) = run[j - 1], run[j]; f = (t - d[j - 1]) / ((d[j] - d[j - 1]) or 1)
            ja, jb = run[max(0, j - 4)], run[min(len(run) - 1, j + 3)]
            add('stone_retaining_wall', x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, math.atan2(-(jb[1] - ja[1]), jb[0] - ja[0]), WALL_S)
    for sx in stairs:
        z = z_on(line, sx); zl = z_on(line, sx - 1); zr = z_on(line, sx + 1)
        add('stone_wood_steps', sx, z, math.atan2(-(zr - zl), 2.0), WALL_S)
wall_along(LINE_BACK, []); wall_along(LINE_A, STAIRS_A); wall_along(LINE_B, STAIRS_B)

# ── 축대 따라 꽃밭 (키아트: 경계마다 빨강·흰 꽃, 풀)
for line, offs in [(LINE_A, (1.4, -1.0)), (LINE_B, (-1.4, 1.6)), (LINE_BACK, (1.3,))]:
    for off in offs:
        for x in range(-40, 41, 2):
            x = x + rnd.uniform(-0.5, 0.5); z = z_on(line, x) + off + rnd.uniform(-0.3, 0.3)
            if near_road(x, z, 0.6) or any(in_poly(p, x, z) for p in POLYS) or math.hypot(x - PLAZA_C[0], z - PLAZA_C[1]) < PLAZA_R + 0.6: continue
            if abs(x - SHOP[0]) < 4.4 and abs(z - SHOP[1]) < 4.0: continue
            r = rnd.random()
            add('red_flower_bush' if r < 0.45 else 'white_flower_bush' if r < 0.66 else 'green_round_bush' if r < 0.82 else 'tall_grass_clump', x, z, rnd.uniform(0, 6), rnd.uniform(0.85, 1.1))

# ── 풍차 · 숲 · 바위 (키아트 위치)
addp('wooden_windmill', 1390, 110, 0.3, 1.0)
for px, py, a in [(100,90,'fir_tree'),(280,40,'fir_tree'),(420,80,'apple_tree'),(560,40,'fir_tree'),(780,60,'fir_tree'),(1200,40,'apple_tree'),(1330,30,'fir_tree'),
                  (1480,40,'fir_tree'),(1640,40,'fir_tree'),(1900,110,'apple_tree'),(1780,60,'fir_tree'),
                  (270,220,'apple_tree'),(60,300,'fir_tree'),(30,520,'fir_tree'),(1920,560,'apple_tree'),(1960,330,'fir_tree'),
                  (40,820,'fir_tree'),(60,1000,'apple_tree'),(260,1080,'apple_tree'),(1280,1000,'fir_tree'),(1500,1000,'fir_tree'),
                  (1860,900,'fir_tree'),(1700,1080,'apple_tree'),(1050,1090,'fir_tree'),(450,1110,'apple_tree')]:
    addp(a, px, py, rnd.uniform(0, 6), rnd.uniform(1.0, 1.15))
for px, py, s in [(300,120,1.1),(1830,830,1.3),(1700,940,1.2),(1150,980,1.1),(560,1080,1.2),(120,1100,1.0)]:
    addp('large_boulder', px, py, rnd.uniform(0, 6), s)

# ── 키아트 바깥(맵 가장자리) 숲: 그림 밖은 나무로 채움 (길·동물샵·5번째 이웃 자리는 비움)
def to_px(x, z):
    py = (z - 2.0) / K * 21 + 600; s = 47 + (py - 600) * 0.024
    return x / K * s + 1000, py
BX, BZ = (-40, 40), (-34, 27)
for gx in range(BX[0] + 1, BX[1], 4):
    for gz in range(BZ[0] + 1, BZ[1], 4):
        x = gx + rnd.uniform(-1.3, 1.3); z = gz + rnd.uniform(-1.3, 1.3)
        px, py = to_px(x, z)
        if -60 < px < 2060 and -40 < py < 1165: continue
        if near_road(x, z, 1.6) or math.hypot(x - SHOP[0], z - SHOP[1]) < 7.5 or math.hypot(x - N5[0], z - N5[1]) < 9: continue
        add('fir_tree' if rnd.random() < 0.65 else 'apple_tree', x, z, rnd.uniform(0, 6), rnd.uniform(0.95, 1.2))
        if rnd.random() < 0.35:
            add(rnd.choice(['green_round_bush', 'tall_grass_clump', 'red_flower_bush']), x + rnd.uniform(1.4, 2), z + rnd.uniform(-1, 1), rnd.uniform(0, 6), 1.0)

layout = {'version': 1,
          'terrain': {'lines': [
              {'pts': LINE_BACK, 'z': -31, 'above': round(3 * STEP, 3), 'below': round(2 * STEP, 3), 'stairs': [], 'ramp': 1.6},
              {'pts': LINE_A, 'z': -12, 'above': round(2 * STEP, 3), 'below': round(STEP, 3), 'stairs': [{'x': x, 'w': 4.0} for x in STAIRS_A], 'ramp': 1.6},
              {'pts': LINE_B, 'z': 16, 'above': round(STEP, 3), 'below': 0.0, 'stairs': [{'x': x, 'w': 4.0} for x in STAIRS_B], 'ramp': 1.6}]},
          'places': places, 'paths': [], 'randomDecor': False, 'props': props, 'roads': roads, 'plazas': plazas,
          'ground': {'grass': 'tex_art_lawn.jpg', 'path': 'tex_art_path.jpg', 'plaza': 'tex_art_cobble.jpg', 'paw': 'tex_paw_tile.png'}   # 키아트에서 색을 뽑아 만든 바닥 (tools/make_floor_textures.py)}
json.dump(layout, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('props', len(props), 'roads', len(roads))
print('lib', LIB, 'board', BOARD, 'shelter', SHELTER, 'home house', (H['hx'], H['hz']))
print('stairs', STAIRS_A, STAIRS_B, 'shop', SHOP, 'n5', N5, 'plaza', PLAZA_C)
