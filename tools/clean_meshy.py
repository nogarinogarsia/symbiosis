# Blender 5.3 headless: Meshy GLB → 팀 규칙에 맞춘 .blend (에셋 1개)
# 실행: blender -b --python tools/clean_meshy.py -- <입력.glb> <출력.blend> <재질이름> [목표높이m] [텍스처크기]
# 규칙: 1단위=1m · 원점=바닥 중앙(Z=0) · 정면=-Y(glTF +Z) · 트랜스폼 적용 · Principled + 색 이미지 텍스처만(Pack) · 이름 정리
# 원본 GLB는 읽기만 함.
import bpy, sys, os, mathutils, json

args = sys.argv[sys.argv.index('--') + 1:]
src, out, mat_name = os.path.abspath(args[0]), os.path.abspath(args[1]), args[2]
target_h = float(args[3]) if len(args) > 3 and args[3] not in ('', '-') else None
tex_size = int(args[4]) if len(args) > 4 else 1024
asset = os.path.splitext(os.path.basename(out))[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert meshes, 'no mesh'

# 부모 해제(변형 유지) → 하나로 합치기 → 빈 오브젝트 삭제
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = asset; obj.data.name = asset
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# glTF는 UV 이음매마다 정점을 나눠 두므로 같은 위치 정점을 합침 (UV는 면 단위라 유지됨)
import bmesh
bm = bmesh.new(); bm.from_mesh(obj.data)
v_before = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
merged = v_before - len(bm.verts)
bm.to_mesh(obj.data); bm.free()
try:
    bpy.ops.object.shade_smooth_by_angle(angle=0.7)   # 약 40도: 둥근 면은 부드럽게, 모서리는 살림
except Exception as e:
    print('smooth', e)

def bounds():
    vs = [v.co for v in obj.data.vertices]
    mn = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx

mn, mx = bounds(); before = mx - mn
if target_h:
    k = target_h / (mx.z - mn.z)
    obj.data.transform(mathutils.Matrix.Scale(k, 4))
mn, mx = bounds()
obj.data.transform(mathutils.Matrix.Translation(-mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
mn, mx = bounds(); size = mx - mn

# 재질: 색 텍스처만 남기고 Principled로 다시 연결, 이름 정리, 텍스처 축소·Pack
base_img = None
for m in obj.data.materials:
    if not m or not m.use_nodes: continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for l in n.inputs['Base Color'].links:
                if l.from_node.type == 'TEX_IMAGE': base_img = l.from_node.image
mat = bpy.data.materials.new(mat_name); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
if base_img:
    # 묶여 있는(packed) 원본은 pack() 때 원본으로 되돌아가므로, 축소한 픽셀을 새 이미지에 옮겨 담아 Pack
    _ = base_img.pixels[0]
    if max(base_img.size) > tex_size:
        base_img.scale(tex_size, tex_size)
    w, h = base_img.size
    small = bpy.data.images.new(asset + '_color', w, h, alpha=True)
    small.colorspace_settings.name = 'sRGB'
    small.pixels.foreach_set(list(base_img.pixels))
    small.file_format = 'PNG'
    small.pack()
    base_img = small
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = base_img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
obj.data.materials.clear(); obj.data.materials.append(mat)
for img in list(bpy.data.images):
    if img != base_img: bpy.data.images.remove(img)
for m in list(bpy.data.materials):
    if m != mat: bpy.data.materials.remove(m)

# 검사: 떨어진 조각 수, 음수 스케일 없음
bm = bmesh.new(); bm.from_mesh(obj.data)
seen, parts = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, cnt = [v], 0; seen.add(v.index)
    while stack:
        x = stack.pop(); cnt += 1
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); stack.append(y)
    parts.append(cnt)
tris = sum(len(f.verts) - 2 for f in bm.faces); bm.free()

os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
rep = {'asset': asset, 'source': os.path.basename(src), 'size_before_m': [round(v, 3) for v in before],
       'size_m': [round(v, 3) for v in size], 'floor_z': round(mn.z, 4), 'center_xy': [round((mn.x + mx.x) / 2, 4), round((mn.y + mx.y) / 2, 4)],
       'tris': tris, 'merged_seam_verts': merged, 'loose_parts': len(parts), 'small_parts(<50v)': sum(1 for c in parts if c < 50),
       'material': mat_name, 'texture': [base_img.size[0], base_img.size[1]] if base_img else None,
       'blend_kb': os.path.getsize(out) // 1024}
print('REPORT ' + json.dumps(rep, ensure_ascii=False))
