import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
src=root/'viewer'/'v88.8'/'orbital-nexus.glb'
out=root/'artifacts'/'phase-4-5'/'orbital-nexus-phase-4-5-candidate.blend'
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
changed=[]
for mat in bpy.data.materials:
    if mat.name not in {'R13_glass_blue','V7_optical_cyan_glass'} or not mat.use_nodes:
        continue
    principled=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if principled is None:
        continue
    old_alpha=float(principled.inputs['Alpha'].default_value)
    principled.inputs['Transmission Weight'].default_value=0.0
    principled.inputs['Alpha'].default_value=min(0.48,max(old_alpha,0.38))
    principled.inputs['Roughness'].default_value=max(float(principled.inputs['Roughness'].default_value),0.24)
    principled.inputs['Metallic'].default_value=max(float(principled.inputs['Metallic'].default_value),0.12)
    emission=principled.inputs.get('Emission Color')
    if emission is not None:
        color=emission.default_value
        emission.default_value=(color[0]*1.35,color[1]*1.35,color[2]*1.35,color[3])
    if hasattr(mat,'surface_render_method'):
        mat.surface_render_method='BLENDED'
    changed.append(mat.name)
if set(changed)!={'R13_glass_blue','V7_optical_cyan_glass'}:
    raise RuntimeError(f'Expected both glass materials; found {changed}')
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print('BLENDER_SCENE_PREPARED',{'blend':str(out),'objects':len(bpy.data.objects),'meshes':sum(o.type=='MESH' for o in bpy.data.objects),'actions':len(bpy.data.actions),'materials':changed})
