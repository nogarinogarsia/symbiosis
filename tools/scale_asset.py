# Blender 5.3 headless: 에셋을 바닥 중앙(원점) 기준으로 배율만큼 키운 새 .blend를 만듦. 원본 파일은 건드리지 않음.
# 실행: blender -b 원본.blend --python tools/scale_asset.py -- <배율> <새 파일 경로>
# 예:   blender -b C:/SYMBIOSIS/cozy/olive_tile_cat_shelter.blend --python tools/scale_asset.py -- 2 C:/SYMBIOSIS/cozy/olive_tile_cat_shelter_x2.blend
import bpy, sys, os, mathutils

args = sys.argv[sys.argv.index('--') + 1:]
factor, out = float(args[0]), os.path.abspath(args[1])
assert factor > 0 and out.endswith('.blend') and os.path.abspath(bpy.data.filepath) != out, '원본을 덮어쓰지 않음'

def measure():
    dg = bpy.context.evaluated_depsgraph_get()
    mn = mathutils.Vector((1e9,) * 3); mx = -mn.copy(); tris = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            mn = mathutils.Vector(map(min, mn, p)); mx = mathutils.Vector(map(max, mx, p))
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
    return mn, mx, tris

mn0, mx0, tris0 = measure()
print('BEFORE size', tuple(round(v, 3) for v in mx0 - mn0), 'min', tuple(round(v, 3) for v in mn0), 'tris', tris0)

# 최상위 오브젝트를 월드 원점(바닥 중앙) 기준으로 확대 → 자식은 따라감
S = mathutils.Matrix.Scale(factor, 4)
for o in bpy.context.scene.objects:
    if o.parent is None and o.type in {'MESH', 'EMPTY', 'ARMATURE', 'CURVE'}:
        o.matrix_world = S @ o.matrix_world

# 팀 규칙: 트랜스폼 적용 (메시만, 자식부터 부모 순서 상관없이 일괄)
bpy.ops.object.select_all(action='DESELECT')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    o.select_set(True)
if meshes:
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# 모디파이어 수치(베벨 폭, 솔리디파이 두께 등)도 같은 비율로
for o in meshes:
    for m in o.modifiers:
        for attr in ('width', 'thickness', 'offset_u'):
            if attr in {'offset_u'}:
                continue
            if hasattr(m, attr) and isinstance(getattr(m, attr), float) and m.type in {'BEVEL', 'SOLIDIFY'}:
                setattr(m, attr, getattr(m, attr) * factor)

mn1, mx1, tris1 = measure()
neg = [o.name for o in meshes if min(o.scale) < 0]
print('AFTER size', tuple(round(v, 3) for v in mx1 - mn1), 'min', tuple(round(v, 3) for v in mn1), 'tris', tris1)
print('CHECK floor_z', round(mn1.z, 4), 'center_xy', round((mn1.x + mx1.x) / 2, 4), round((mn1.y + mx1.y) / 2, 4),
      'scales_applied', all(abs(s - 1) < 1e-6 for o in meshes for s in o.scale), 'negative_scale', neg)
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True, compress=True)
print('SAVED', out, os.path.getsize(out))
