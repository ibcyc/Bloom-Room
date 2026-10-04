/* Static, embedded GLB models. Blobs stay in local IndexedDB and travel in house exports. */
(function(H){
 'use strict';
 const cache=new Map(),pending=new Map();
 class CustomModels {
  static inspect(buffer){
   const fail=message=>{throw new Error(message);};
   if(buffer.byteLength<20||buffer.byteLength>10*1024*1024)fail('Choose a GLB file up to 10 MB.');
   const view=new DataView(buffer);
   if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength||view.getUint32(16,true)!==0x4e4f534a)fail('Choose a valid GLB 2.0 file.');
   const length=view.getUint32(12,true);if(length>buffer.byteLength-20)fail('The GLB header is incomplete.');
   let json;try{json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));}catch(_){fail('The model description could not be read.');}
   const visit=(v,depth=0)=>{if(depth>64)fail('This model is too deeply nested.');if(v&&typeof v==='object')for(const [key,value] of Object.entries(v)){if(key==='uri')fail('Use a GLB with all textures and geometry embedded, without external files.');if(['__proto__','constructor','prototype'].includes(key))fail('Invalid model metadata.');visit(value,depth+1);}};visit(json);
   if(json.asset?.version!=='2.0'||!json.meshes?.length||json.meshes.length>128||(json.nodes?.length||0)>256||(json.accessors?.length||0)>512||(json.images?.length||0)>16)fail('Choose a smaller static GLB model.');
   if(json.skins?.length||json.extensionsUsed?.some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu','EXT_mesh_gpu_instancing'].includes(e)))fail('Export a static GLB without skinning, Draco, Meshopt, KTX2 or instancing.');
   if((json.accessors||[]).some(a=>!Number.isSafeInteger(a.count)||a.count<0)||json.accessors.reduce((sum,a)=>sum+a.count,0)>1000000)fail('This model has too much geometry.');
   const walked=new Set();const walk=(i,path=new Set())=>{if(!Number.isInteger(i)||!json.nodes[i]||path.has(i)||path.size>64)fail('Invalid model hierarchy.');if(walked.has(i))return;const next=new Set(path);next.add(i);for(const child of json.nodes[i].children||[])walk(child,next);walked.add(i);};(json.nodes||[]).forEach((_,i)=>walk(i));
   return json;
  }
  static async parse(buffer){
   this.inspect(buffer);
   const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw new Error('This model uses an external file. Embed everything in the GLB.');return url;});
   const gltf=await new RoomBloomGLTFLoader(manager).parseAsync(buffer,'');
   const root=new THREE.Group();let vertices=0;
   gltf.scene.updateMatrixWorld(true);
   try{
    gltf.scene.traverse(n=>{
     if(!n.isMesh)return;if(n.isSkinnedMesh||n.isInstancedMesh)throw new Error('Use a static mesh without skinning or instancing.');
     vertices+=n.geometry.attributes.position?.count||0;if(vertices>200000)throw new Error('Keep the model below 200,000 vertices.');
     const geometry=n.geometry.clone();geometry.applyMatrix4(n.matrixWorld);
     // Split material groups so every rendered mesh follows the editor's single-material contract.
     const materials=Array.isArray(n.material)?n.material:[n.material],groups=Array.isArray(n.material)?geometry.groups:[{start:0,count:geometry.index?.count||geometry.attributes.position.count,materialIndex:0}];
     for(const group of groups){const part=geometry.clone();part.clearGroups();part.setDrawRange(group.start,group.count);const mesh=new THREE.Mesh(part,materials[group.materialIndex].clone());mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}geometry.dispose();
    });
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
    if(!vertices||![...bounds.min,...bounds.max,...size].every(Number.isFinite)||size.length()<=0)throw new Error('The model has no usable geometry.');
    root.userData.bounds={size:size.toArray(),center:bounds.getCenter(new THREE.Vector3()).toArray(),bottom:bounds.min.y};
    return root;
   }catch(error){this.dispose(root,true);throw error;}
   finally{gltf.scene.traverse(n=>{n.geometry?.dispose();for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])m.dispose();});}
  }
  static async upload(file){
   if(!file||!file.name?.toLowerCase().endsWith('.glb'))throw new Error('Choose a .glb model.');
   if(file.size<20||file.size>10*1024*1024)throw new Error('Choose a GLB file up to 10 MB.');
   const buffer=await file.arrayBuffer(),root=await this.parse(buffer),model={id:H.uid('model'),name:file.name.slice(0,80),bytes:buffer.byteLength};
   try{await H.MediaStore.put(model.id,new Blob([buffer],{type:'model/gltf-binary'}));}catch(e){this.dispose(root,true);throw e;}
   cache.set(model.id,root);return model;
  }
  static get(id){return cache.get(id);}
  static load(model){
   if(cache.has(model.id))return Promise.resolve(cache.get(model.id));
   if(!pending.has(model.id))pending.set(model.id,(async()=>{const blob=await H.MediaStore.get(model.id);if(!blob)throw new Error('The model '+model.name+' is missing. Import the original house JSON to restore it.');if(blob.size!==model.bytes)throw new Error('This stored model is incomplete. Import the original house JSON to restore it.');const root=await this.parse(await blob.arrayBuffer());cache.set(model.id,root);return root;})().finally(()=>pending.delete(model.id)));
   return pending.get(model.id);
  }
  static instance(data){
   const original=cache.get(data.customState.model.id);if(!original)return null;
   const root=new THREE.Group(),b=original.userData.bounds,scale=Math.min(...b.size.map((n,i)=>n>0?[data.size.x*.94,data.size.y,data.size.z*.94][i]/n:Infinity));
   for(const child of original.children){const mesh=new THREE.Mesh(child.geometry.clone(),child.material.clone());mesh.geometry.translate(-b.center[0],-b.bottom,-b.center[2]);mesh.geometry.scale(scale,scale,scale);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
   return root;
  }
  static dispose(root,textures=false){const maps=new Set();root.traverse(n=>{n.geometry?.dispose();for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){if(textures)for(const v of Object.values(m))if(v?.isTexture)maps.add(v);m.dispose();}});for(const map of maps){map.dispose();map.image?.close?.();}}
 }
 H.CustomModels=CustomModels;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
