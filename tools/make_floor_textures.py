# 키아트에서 바닥 색을 뽑아 이어지는(seamless) 바닥 텍스처 3장을 만듦 (원래 Meshy 텍스처는 건드리지 않음)
# 실행: python tools/make_floor_textures.py <키아트 이미지> assets/textures
import sys, os
import numpy as np
from PIL import Image, ImageFilter

ART, OUT = sys.argv[1], sys.argv[2]
art = np.asarray(Image.open(ART).convert('RGB')).astype(np.float32)
N = 1024
rng = np.random.default_rng(7)

def palette(boxes, n=64):
    """키아트 영역들의 픽셀을 밝기순으로 정렬해 n단계 색표로"""
    px = np.concatenate([art[y0:y1, x0:x1].reshape(-1, 3) for x0, y0, x1, y1 in boxes])
    lum = px @ [0.3, 0.59, 0.11]; px = px[np.argsort(lum)]
    idx = np.linspace(0, len(px) - 1, n).astype(int)
    k = max(1, len(px) // n)
    return np.array([px[max(0, i - k):i + k + 1].mean(0) for i in idx])

def noise(freq, octaves=4, persist=0.5):
    """타일되는 fbm 노이즈 (주기 경계에서 이어짐), 0~1"""
    out = np.zeros((N, N)); amp = 1; tot = 0
    for o in range(octaves):
        f = freq * 2 ** o
        g = rng.random((f, f))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC, reducing_gap=None)
        # bicubic 확대는 가장자리가 안 이어지므로 3×3 타일로 확대 후 가운데만
        big = Image.fromarray((np.tile(g, (3, 3)) * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
        a = np.asarray(big).astype(np.float32)[N:2 * N, N:2 * N] / 255
        out += a * amp; tot += amp; amp *= persist
    out /= tot
    return (out - out.min()) / (out.max() - out.min())

def apply_pal(v, pal, lo=0.08, hi=0.92):
    v = lo + (hi - lo) * np.clip(v, 0, 1)
    i = v * (len(pal) - 1); i0 = np.floor(i).astype(int); t = (i - i0)[..., None]
    i1 = np.minimum(i0 + 1, len(pal) - 1)
    return pal[i0] * (1 - t) + pal[i1] * t

def voronoi(cells):
    """타일되는 보로노이: (가장 가까운 점 번호, 1등 거리, 2등 거리)"""
    g = int(round(cells ** 0.5)); cells = g * g             # 고르게 흩은 격자점 (가늘고 긴 조각 방지)
    gy, gx = np.mgrid[0:g, 0:g]
    pts = (np.stack([gx.ravel(), gy.ravel()], 1) + 0.5 + rng.uniform(-0.32, 0.32, (cells, 2))) * (N / g)
    pts[:, 0] += (gy.ravel() % 2) * (N / g) * 0.5
    P = np.concatenate([pts + [dx * N, dy * N] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    ids = np.tile(np.arange(cells), 9)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d1 = np.full((N, N), 1e9, np.float32); d2 = d1.copy(); who = np.zeros((N, N), int)
    for (px, py), i in zip(P, ids):
        d = np.hypot(xx - px, yy - py)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d)); who = np.where(closer, i, who); d1 = np.where(closer, d, d1)
    return who, d1, d2

def save(a, name):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), quality=92)
    print('saved', name)

# 1) 마당 잔디: 키아트의 매끈한 올리브 잔디 (꽃 없이, 붓 터치처럼 부드러운 얼룩)
# 색표: 키아트 전체에서 잔디색(올리브 초록) 픽셀만 골라 밝기순으로 (한 곳만 뽑으면 햇빛 받은 노란 쪽으로 치우침)
hsv = np.asarray(Image.open(ART).convert('RGB').convert('HSV')).astype(np.float32)
H, S, V = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
gm = (H > 55) & (H < 95) & (S > 0.4) & (V > 0.35) & (V < 0.75)
gpx = art[gm]; gpx = gpx[np.argsort(gpx @ [0.3, 0.59, 0.11])]
lawn_pal = np.array([gpx[max(0, i - 200):i + 200].mean(0) for i in np.linspace(0, len(gpx) - 1, 64).astype(int)])
def strokes(w, h):
    """세로로 긴 붓 터치(잔디 잎 느낌), 타일됨"""
    g = rng.random((h, w))
    big = Image.fromarray((np.tile(g, (3, 3)) * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
    return np.asarray(big).astype(np.float32)[N:2 * N, N:2 * N] / 255
v = 0.6 * noise(4, 4, 0.55) + 0.22 * noise(32, 2, 0.5) + 0.18 * strokes(256, 64)
lawn = apply_pal(v, lawn_pal, 0.3, 0.88)
save(lawn, 'tex_art_lawn.jpg')

# 2) 흙길: 복숭아빛 테라코타 + 흐린 넓적돌 모양
path_pal = palette([(1205, 880, 1290, 905), (880, 1005, 960, 1030), (1210, 905, 1250, 925)])
who, d1, d2 = voronoi(16)
edge = np.clip((d2 - d1) / 10, 0, 1)                       # 돌 경계는 아주 옅게
cell = rng.random(16)[who]
v = 0.55 * noise(6, 4, 0.5) + 0.25 * cell + 0.2 * edge
path = apply_pal(v, path_pal, 0.2, 0.85)
save(path, 'tex_art_path.jpg')

# 3) 광장 돌바닥: 분홍·베이지 둥근 돌 + 밝은 줄눈
stone_pal = palette([(940, 700, 990, 725), (1060, 715, 1120, 740), (660, 630, 700, 650)])
light = stone_pal[int(len(stone_pal) * 0.9):].mean(0)      # 줄눈: 가장 밝은 쪽
def wblur(a, r):
    """가장자리가 이어지게 흐림"""
    big = (np.clip(np.tile(a, (3, 3)), 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(big).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32)[N:2 * N, N:2 * N] / 255
C = 36
who, d1, d2 = voronoi(C)
gap = (d2 - d1)
body = wblur((gap > 9).astype(np.float32), 7)              # 모서리를 둥글린 돌 모양
stone_m = np.clip((body - 0.45) / 0.12, 0, 1)
dome = wblur(stone_m, 12)                                   # 가운데 볼록, 가장자리 어둡게
tone = rng.uniform(0.15, 0.75, C)[who]
v = tone + 0.35 * (dome - 0.6) + 0.10 * (noise(16, 3) - 0.5)
stone = apply_pal(v, stone_pal, 0.05, 0.8)
mort = apply_pal(0.55 + 0.25 * noise(24, 2), stone_pal, 0.75, 0.97)   # 줄눈: 밝은 복숭아빛
moss = (noise(10, 3) > 0.8) & (wblur(stone_m, 2) < 0.3)                                   # 군데군데 줄눈 이끼
mort = np.where(moss[..., None], mort * 0.7 + lawn_pal[len(lawn_pal) // 2] * 0.3, mort)
cob = stone * stone_m[..., None] + mort * (1 - stone_m[..., None])
save(cob, 'tex_art_cobble.jpg')
