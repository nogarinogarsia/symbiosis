# Blender 5.3 headless: newcat_rig_practice.blend -> assets/models/newcat.glb (+ face texture)
# 실행: blender -b assets/cat_src/Newcat_Rig_Practice/newcat_rig_practice.blend --python tools/export_newcat.py
# 원본 .blend는 저장하지 않음(메모리 안에서만 정리 후 내보냄).
import bpy, bmesh, os, mathutils

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
os.makedirs(OUT, exist_ok=True)
CAT = 'Meshy_AI_Chubby_Striped_Kitten_20261116_generate'

src = bpy.data.objects[CAT]
# 고양이만 남기기
for o in list(bpy.data.objects):
    if o != src:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.context.view_layer.objects.active = src
src.select_set(True)
# 모디파이어(Mirror, Face UV GN) 적용: 평가된 메시로 교체
dg = bpy.context.evaluated_depsgraph_get()
ev = src.evaluated_get(dg)
me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
src.modifiers.clear()
old = src.data
src.data = me
bpy.data.meshes.remove(old)
print('UV layers after apply:', [u.name for u in me.uv_layers])
print('attributes:', [(a.name, a.domain, a.data_type) for a in me.attributes])

# 트랜스폼 적용 (X 90도 회전 굽기)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 원점 = 발밑 바닥 중앙
pts = [v.co for v in me.vertices]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
off = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
me.transform(mathutils.Matrix.Translation(-off))
src.name = 'newcat'
me.name = 'newcat'
print('size m:', tuple(round(v, 3) for v in (mx - mn)))

# 표정 텍스처는 따로 저장(1024로 축소)
def save_image(name, path, size=None):
    im = bpy.data.images[name]
    im2 = im.copy()
    if size:
        im2.scale(size, size)
    im2.filepath_raw = path
    im2.file_format = 'PNG'
    im2.save()
    print('saved', path)
    return im2

save_image('Face_Smile_RGBA', os.path.join(OUT, 'newcat_face_smile.png'), 1024)
coat_img = bpy.data.images['White_Cat_Blue_Coat.png']

# 게임용 단순 재질: coat (Principled + 이미지). 게임이 이름으로 찾아 툰 셰이더로 교체
mat = bpy.data.materials.new('coat')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = coat_img
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
# FaceExpressionUV도 내보내지도록 두 번째 이미지 노드에 연결(알파 미사용)
uv2 = nt.nodes.new('ShaderNodeUVMap'); uv2.uv_map = 'FaceExpressionUV'
me.materials.clear()
me.materials.append(mat)
# 쓰지 않는 UV는 제거해 크기 절약
for name in ['FaceAtlas']:
    if name in me.uv_layers:
        me.uv_layers.remove(me.uv_layers[name])
me.uv_layers.active = me.uv_layers['UVMap']
print('UV layers final:', [u.name for u in me.uv_layers])

path = os.path.join(OUT, 'newcat.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT',
                          export_yup=True, export_apply=False)
print('exported', path, os.path.getsize(path))
