"""Export the saved supermarket cutaway without altering its .blend source."""
import bpy, json, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT.parent/'blender'/'M-Mart-Supermarket.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.data.scenes.new('Web export staging')
for name in ['01_ARCHITECTURE','02_SHELVING','03_CHECKOUT','05_DISPLAYS','06_SIGNAGE','07_PRODUCTS']:
    scene.collection.children.link(bpy.data.collections[name])
bpy.context.window.scene=scene
scene.frame_set(1)
bpy.context.view_layer.update()
# glTF cannot carry procedural Blender shader graphs. Preserve their base PBR values.
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    old=mat.node_tree.nodes.get('Principled BSDF')
    if not old:continue
    values={k:old.inputs[k].default_value[:] if hasattr(old.inputs[k].default_value,'__len__') else old.inputs[k].default_value for k in ['Base Color','Metallic','Roughness','IOR','Transmission Weight','Emission Color','Emission Strength']}
    values['Base Color']=tuple(mat.diffuse_color)
    if 'glazing' in mat.name.lower():
        values['Base Color']=(.75,.88,.92,.16);values['Transmission Weight']=0;values['Roughness']=.15
    mat.node_tree.nodes.clear()
    shader=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    for k,v in values.items():shader.inputs[k].default_value=v
    shader.inputs['Alpha'].default_value=values['Base Color'][3]
    mat.node_tree.links.new(shader.outputs[0],out.inputs['Surface'])
    mat.surface_render_method='DITHERED'
flat=bpy.data.scenes.new('M-MART Web Model')
parent=bpy.data.objects.new('M-MART supermarket cutaway',None);flat.collection.objects.link(parent)
cache={};count=0
deps=bpy.context.evaluated_depsgraph_get()
for inst in deps.object_instances:
    ev=inst.object
    if ev.type not in {'MESH','FONT','CURVE'}:continue
    original=ev.original
    key=(ev.type,original.data.as_pointer())
    if key not in cache:
        if ev.type=='MESH' and not original.modifiers:mesh=original.data.copy()
        else:mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=deps)
        cache[key]=mesh
    item=bpy.data.objects.new(original.name,cache[key]);flat.collection.objects.link(item)
    item.parent=parent;item.matrix_world=inst.matrix_world.copy();count+=1
bpy.context.window.scene=flat
bpy.context.view_layer.update()
# Product lettering is dense geometry in the presentation file. Reduce those
# repeated meshes for interactive use, preserving the original .blend untouched.
optimized=0
for mesh in list(cache.values()):
    if 'linked mesh' not in mesh.name or len(mesh.polygons)<500:continue
    users=[o for o in flat.objects if o.type=='MESH' and o.data==mesh]
    if not users:continue
    sample=users[0]
    modifier=sample.modifiers.new('Web product simplification','DECIMATE')
    modifier.ratio=.08
    modifier.use_collapse_triangulate=True
    deps=bpy.context.evaluated_depsgraph_get()
    simplified=bpy.data.meshes.new_from_object(sample.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    sample.modifiers.remove(modifier)
    for item in users:item.data=simplified
    optimized+=1
print('SIMPLIFIED PRODUCT MESHES',optimized,flush=True)
print('EXPORT OBJECTS',count,'UNIQUE MESHES',len(cache),flush=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'models'/'supermarket.raw.glb'),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False,export_extras=False,export_gpu_instances=False,export_yup=True,export_apply=False,export_materials='EXPORT')
(ROOT/'models'/'export-info.json').write_text(json.dumps({'source':source.name,'objects':count,'unique_meshes':len(cache),'simplified_product_meshes':optimized,'view':'Roof cutaway','dimensions':'Indicative, not surveyed','materials':'Procedural Blender materials reduced to portable PBR base values; glazing uses alpha blending.','geometry':'Dense product meshes simplified for interactive performance; repeated meshes GPU-instanced by instance_model.py.'},indent=2))
print('EXPORT_COMPLETE',flush=True)
# Avoid an audio-service shutdown hang in this headless environment.
os._exit(0)
