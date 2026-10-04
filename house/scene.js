/* Rendering adapter: consumes a House Definition, emits pointer intents. No storage/UI business rules. */
(function(H){
  'use strict';
  const G=H.GridSystem;
  function release(root){
    root.traverse(node=>{node.shadow?.map?.dispose();node.geometry?.dispose();node.userData.ownedMap?.dispose();if(node.material){for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});
  }
  function material(color){return new THREE.MeshStandardMaterial({color,roughness:.85});}
  function box(parent,w,h,d,x,y,z,color,paintable=false){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.paintable=paintable;parent.add(mesh);return mesh;
  }
  function sphere(parent,r,x,y,z,color){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(parent,top,bottom,height,x,y,z,color){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,16),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  class SelectionSystem {
    constructor(scene,color='#1767ff',opacity=.22){this.color=color;this.opacity=opacity;this.scene=scene;this.lines=new THREE.Group();scene.add(this.lines);this.current=null;}
    clear(){for(const c of [...this.lines.children]){release(c);this.lines.remove(c);}this.current=null;}
    show(entry){
      if(entry?.data.id===this.current)return;
      this.clear();if(!entry)return;this.current=entry.data.id;entry.root.updateWorldMatrix(true,true);
      entry.root.traverse(node=>{
        if(!node.isMesh)return;
        const line=new THREE.LineSegments(new THREE.EdgesGeometry(node.geometry,25),new THREE.LineBasicMaterial({color:this.color,depthTest:false,transparent:true,opacity:1}));
        const tint=new THREE.Mesh(node.geometry.clone(),new THREE.MeshBasicMaterial({color:this.color,transparent:true,opacity:this.opacity,depthTest:false,depthWrite:false}));
        tint.matrix.copy(node.matrixWorld);tint.matrixAutoUpdate=false;tint.renderOrder=19;this.lines.add(tint);
        line.matrix.copy(node.matrixWorld);line.matrixAutoUpdate=false;line.renderOrder=20;this.lines.add(line);
      });
      const bounds=new THREE.Box3().setFromObject(entry.root).expandByScalar(.045);
      const helper=new THREE.Box3Helper(bounds,this.color);helper.material.depthTest=false;helper.material.transparent=true;helper.renderOrder=21;this.lines.add(helper);
    }
  }
  class SceneView {
    constructor(host,house,emit){
      if(!globalThis.THREE)throw new Error('Three.js did not load. Keep the vendor folder beside index.html.');
      this.host=host;this.house=house;this.emit=emit;this.entries=new Map();this.textures=new Map();this.events=new AbortController();this.pointer=null;this.activePointers=new Map();
      this.state={editing:false,layer:'STRUCTURE',tool:'SELECT',build:null,side:'N'};
      this.scene=new THREE.Scene();
      this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setClearColor(0x000000,0);
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
      this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','Interactive isometric house. Use the gear to enter Edit mode. Drag outside the house to pan.');this.canvas.setAttribute('role','img');this.canvas.tabIndex=0;
      host.replaceChildren(this.canvas);
      // Weather is behind the transparent WebGL canvas. Opaque house surfaces
      // naturally occlude it, including the open front edge and all furniture.
      this.weatherCanvas=document.createElement('canvas');this.weatherCanvas.className='house-weather-background';this.weatherCanvas.setAttribute('aria-hidden','true');host.before(this.weatherCanvas);
      this.weatherContext=this.weatherCanvas.getContext('2d');this.weather={kind:house.weather?.kind||'sunny',level:1};this.weatherDirty=true;
      this.weatherMotion=matchMedia('(prefers-reduced-motion: reduce)');
      this.weatherMotion.addEventListener('change',()=>{this.weatherDirty=true;},{signal:this.events.signal});
      this.camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,150);this.controls=new H.CameraController(this.camera,host);
      this.ambient=new THREE.HemisphereLight('#fffaf0','#87957e',2.5);this.scene.add(this.ambient);
      const sun=this.sun=new THREE.DirectionalLight('#fff8e5',2.7);sun.position.set(6,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
      Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.1,far:60});sun.shadow.bias=-.0006;sun.shadow.normalBias=.025;this.scene.add(sun);
      // Only house surfaces receive shadows. An exterior shadow plane would
      // project indoor point-light shadows far beyond the floor boundary.
      this.grid=new THREE.GridHelper(20,20,'#9ca994','#c6cfbd');this.grid.position.set(2,.005,2);this.grid.material.transparent=true;this.grid.material.opacity=.38;this.scene.add(this.grid);
      this.origin=new THREE.Mesh(new THREE.PlaneGeometry(.94,.94),new THREE.MeshBasicMaterial({color:'#cda248',transparent:true,opacity:.45,side:THREE.DoubleSide}));
      this.origin.rotation.x=-Math.PI/2;this.origin.position.set(.5,.01,.5);this.scene.add(this.origin);
      this.raycaster=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
      this.selection=new SelectionSystem(this.scene);this.hoverSelection=new SelectionSystem(this.scene,'#b66b00',.1);this.ghost=null;this.animalMesh=this.makeAnimal();this.scene.add(this.animalMesh);this.animalMesh.traverse(n=>{if(n.isMesh)n.userData.entity={kind:'animal',id:'pip'};});
      this.pathLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#91a879',transparent:true,opacity:.65}));this.scene.add(this.pathLine);
      this.sync(house);this.controls.frame(house);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();this.bind();
    }
    makeStructure(kind,data,h){
      const group=new THREE.Group();
      if(kind==='floor'){box(group,.988,.12,.988,0,-.06,0,'#d7bd94',true);}
      if(kind==='wall'){
        if(h.structure.doors.some(d=>d.wallId===data.id)){
          box(group,.12,2.4,.1,-.44,1.2,0,'#e4e4cf',true);box(group,.12,2.4,.1,.44,1.2,0,'#e4e4cf',true);box(group,.76,.6,.1,0,2.1,0,'#e4e4cf',true);
        }else box(group,1,2.4,.1,0,1.2,0,'#e4e4cf',true);
      }
      if(kind==='door'){
        const pivot=new THREE.Group();pivot.position.x=-.36;group.add(pivot);group.userData.hinge=pivot;
        box(pivot,.72,1.76,.065,.36,.9,0,'#ac7c53',true);sphere(pivot,.035,.63,.9,.055,'#eee0a0');
      }
      return group;
    }
    makeFurniture(type,data=null){
      if(type==='cat')return this.makeAnimal();
      const root=new THREE.Group(),c=H.Catalog[type].color;
      if(type==='custom'){
        const instance=data&&H.CustomModels.instance(data);if(instance)return instance;
        box(root,data?.size.x||.7,data?.size.y||.7,data?.size.z||.7,0,(data?.size.y||.7)/2,0,c);
      }else if(type==='fridge'){
        box(root,.8,1.8,.76,0,.9,0,c);box(root,.76,.54,.045,0,1.48,.402,'#d5e1dd');box(root,.76,1.14,.045,0,.6,.402,'#c8d8d3');
        box(root,.055,.3,.07,.27,1.48,.45,'#697b79');box(root,.055,.45,.07,.27,.89,.45,'#697b79');
      }else if(type==='vacuum'){
        cylinder(root,.28,.32,.23,0,.15,.1,c);cylinder(root,.2,.2,.06,0,.3,.1,'#e9d9bd');
        for(const x of [-.28,.28])sphere(root,.095,x,.12,.1,'#4b5655');
        box(root,.045,.78,.045,0,.6,-.2,'#74867d');box(root,.17,.045,.07,0,1,-.2,'#4b5655');box(root,.45,.075,.16,0,.05,-.3,'#4b5655');
      }else if(type==='sofa'){
        box(root,.82,.34,.65,0,.3,0,c);box(root,.82,.45,.13,0,.6,-.29,c);box(root,.13,.36,.65,-.35,.46,0,c);box(root,.13,.36,.65,.35,.46,0,c);
        box(root,.24,.18,.2,-.15,.57,-.12,'#e8d396');for(const x of [-.28,.28])for(const z of [-.23,.23])box(root,.065,.15,.065,x,.08,z,'#795b42');
      }else if(type==='bed'){
        box(root,.78,.2,.87,0,.19,0,'#aa8b6c');box(root,.75,.14,.82,0,.35,0,c);box(root,.76,.58,.1,0,.38,-.4,'#9f8063');box(root,.57,.13,.22,0,.46,-.23,'#f7edd8');
      }else if(type==='table'||type==='longtable'){
        const half=type==='longtable'?.79:.29;box(root,type==='longtable'?1.8:.8,.12,.8,0,.67,0,c);for(const x of [-half,half])for(const z of [-.29,.29])box(root,.07,.65,.07,x,.33,z,c);
      }else if(type==='trash'){
        cylinder(root,.26,.21,.64,0,.34,0,c);cylinder(root,.29,.29,.07,0,.69,0,'#4c6b60');box(root,.15,.055,.075,0,.76,0,'#40564e');
      }else if(type==='bowl'){
        cylinder(root,.3,.25,.14,0,.08,0,c);cylinder(root,.23,.23,.012,0,.158,0,'#795b48');for(let i=0;i<5;i++)sphere(root,.04,Math.sin(i*2.2)*.11,.17,Math.cos(i*2.2)*.11,'#b58d51');
      }else if(type==='plant'){
        cylinder(root,.22,.16,.34,0,.18,0,'#ce976c');cylinder(root,.022,.022,.55,0,.59,0,'#5d7f48');
        for(const [x,y,z] of [[-.14,.72,0],[.13,.87,0],[.04,.65,.12]]){const leaf=sphere(root,.17,x,y,z,c);leaf.scale.set(.75,1.3,.42);leaf.rotation.z=x*3;leaf.userData.leaf=true;}
        sphere(root,.018,-.07,.22,.195,'#473e30');sphere(root,.018,.07,.22,.195,'#473e30');
      }else if(type==='laundry'){
        for(const y of [.43,1.29]){
          box(root,.76,.82,.7,0,y,0,c);box(root,.66,.09,.025,0,y+.3,.362,'#f0eee2');
          const drum=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,10,32),material('#687a78'));drum.position.set(0,y-.035,.366);root.add(drum);
          const glass=new THREE.Mesh(new THREE.CircleGeometry(.2,32),material('#829b9f'));glass.position.set(0,y-.035,.369);root.add(glass);sphere(root,.025,.22,y+.3,.39,'#47685d');
        }
      }else if(type==='oven'){
        box(root,.8,.85,.76,0,.43,0,c);box(root,.7,.52,.025,0,.36,.39,'#3e514c');box(root,.57,.36,.025,0,.35,.406,'#6e8585');box(root,.59,.045,.06,0,.66,.42,'#e6e2d3');
        for(const x of [-.24,0,.24])sphere(root,.035,x,.78,.4,'#435f56');
      }else if(type==='speaker'){
        box(root,.34,.5,.28,0,.25,0,c);
        for(const [radius,y] of [[.095,.18],[.055,.38]]){const cone=new THREE.Mesh(new THREE.CircleGeometry(radius,24),material('#283d36'));cone.position.set(0,y,.145);root.add(cone);}
      }else if(type==='board'){
        box(root,.78,.6,.07,0,0,0,c);box(root,.71,.53,.02,0,0,.046,'#e8d8b7');
        for(const x of [-.22,0,.22]){box(root,.17,.27,.012,x,.04,.065,'#fff9e7');box(root,.1,.015,.015,x,.09,.074,'#b5baa3');box(root,.1,.015,.015,x,.02,.074,'#b5baa3');}
      }else if(type==='lamp'){
        box(root,.24,.33,.13,0,0,0,'#856a46');const bulb=sphere(root,.17,0,0,.14,'#f8df9d');bulb.material.emissive.set('#bf9d53');bulb.material.emissiveIntensity=.2;bulb.castShadow=false;bulb.userData.bulb=true;
      }else if(type==='floorlamp'){
        cylinder(root,.24,.27,.09,0,.055,0,'#6c776a');cylinder(root,.035,.035,1.45,0,.79,0,'#806c50');
        const shade=cylinder(root,.2,.34,.37,0,1.67,0,c);shade.castShadow=false;shade.userData.bulb=true;shade.userData.shade=true;const bulb=sphere(root,.1,0,1.5,0,'#fff0bf');bulb.castShadow=false;bulb.userData.bulb=true;
      }else if(type==='water'||type==='electricity'){
        const shape=new THREE.Shape();
        if(type==='electricity'){shape.moveTo(.04,.2);shape.lineTo(-.15,-.02);shape.lineTo(-.025,-.02);shape.lineTo(-.065,-.2);shape.lineTo(.15,.055);shape.lineTo(.015,.055);shape.closePath();}
        else{shape.moveTo(0,.21);shape.bezierCurveTo(-.04,.13,-.17,-.02,-.15,-.1);shape.bezierCurveTo(-.12,-.25,.12,-.25,.15,-.1);shape.bezierCurveTo(.17,-.02,.04,.13,0,.21);}
        const symbol=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:2,steps:1}),material(c));symbol.position.z=.065;symbol.castShadow=true;root.add(symbol);
      }else if(type==='window'){
        box(root,.74,.46,.06,0,0,0,'#f7efd9');
        const sky=new THREE.Mesh(new THREE.PlaneGeometry(.63,.35),new THREE.MeshBasicMaterial({map:this.windowSkyTexture(),toneMapped:false}));
        sky.position.z=.072;sky.name='window-weather';root.add(sky);
        box(root,.035,.4,.035,0,0,.095,'#fcf2d9');box(root,.65,.035,.035,0,0,.095,'#fcf2d9');
      }else{
        box(root,.5,.42,.06,0,0,0,'#907454');box(root,.43,.35,.065,0,0,.035,'#f4dfb9');
        const picture=new THREE.Mesh(new THREE.PlaneGeometry(.42,.34),material('#f4dfb9'));picture.position.z=.072;root.add(picture);root.userData.picture=picture;
      }
      return root;
    }
    catalogThumbnail(type){
      this.thumbnails||=new Map();if(this.thumbnails.has(type))return this.thumbnails.get(type);
      const renderer=this.thumbnailRenderer||=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(128,112);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
      const scene=new THREE.Scene(),root=this.makeFurniture(type);scene.add(root,new THREE.AmbientLight('#ffffff',2.5));const sun=new THREE.DirectionalLight('#fff0d9',3);sun.position.set(-3,6,5);scene.add(sun);
      const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray())*1.6;
      const camera=new THREE.OrthographicCamera(-span*.58,span*.58,span*.5,-span*.5,.01,100);camera.position.copy(center).add(new THREE.Vector3(4,3.2,6));camera.lookAt(center);
      renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');release(root);this.thumbnails.set(type,image);return image;
    }
    makeAnimal(){
      const root=new THREE.Group();
      const body=sphere(root,.18,0,.25,0,'#d9a278');body.scale.set(.85,.9,1.22);
      sphere(root,.145,0,.38,.16,'#e5b78f');
      for(const x of [-.09,.09]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.16,4),material('#ce956f'));ear.position.set(x,.53,.15);root.add(ear);sphere(root,.018,x*.6,.41,.288,'#453d36');}
      const tail=new THREE.Mesh(new THREE.CylinderGeometry(.035,.028,.28,8),material('#b68566'));tail.rotation.x=-.6;tail.position.set(0,.31,-.24);root.add(tail);
      for(const x of [-.09,.09])for(const z of [-.1,.13])box(root,.065,.12,.07,x,.09,z,'#c59068');
      return root;
    }
    finishTexture(finish){
      if(this.textures.has(finish))return this.textures.get(finish);
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128);
      ctx.strokeStyle=finish==='tile'?'#aeb8ad':'#c9bfae';ctx.lineWidth=finish==='tile'?3:1;
      if(finish==='tile'){ctx.strokeRect(1,1,126,126);}
      else if(finish==='wood'){for(const y of [0,32,64,96,128]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}ctx.strokeStyle='#e4ded5';for(let i=0;i<18;i++){const y=7+i*7;ctx.beginPath();ctx.moveTo(5,y);ctx.bezierCurveTo(40,y+4,70,y-4,123,y);ctx.stroke();}}
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;this.textures.set(finish,texture);return texture;
    }
    placeRoot(root,kind,data,h){
      root.rotation.set(0,0,0);
      if(kind==='floor'){root.position.set(data.grid.x+.5,0,data.grid.z+.5);root.rotation.y=-(data.rotation||0)*Math.PI/180;}
      else if(kind==='wall'||kind==='door'){
        const wall=kind==='wall'?data:h.structure.walls.find(w=>w.id===data.wallId);
        root.position.set(wall.grid.x+(wall.side==='N'?.5:0),0,wall.grid.z+(wall.side==='W'?.5:0));root.rotation.y=wall.side==='W'?Math.PI/2:0;
        if(kind==='door')root.userData.hinge.rotation.y=0;
      }else if(data.placement==='WALL'){
        const w=h.structure.walls.find(w=>w.id===data.attachedWallId);
        if(!w)return;
        root.position.set(w.grid.x+(w.side==='N'?.5:.08),data.height,w.grid.z+(w.side==='W'?.5:.08));
        root.rotation.y=w.side==='W'?Math.PI/2:0;root.rotateZ(data.rotation*Math.PI/180);
      }else{
        const table=h.objects.find(o=>o.id===data.supportId),angle=(table?.rotation||0)*Math.PI/180;
        const slot=data.supportSlot||0,x=(table?.size.x>1?Math.floor(slot/4)-.5:0)+(slot%2 ? .19 : -.19),z=slot%4>=2 ? .19 : -.19;
        const owner=table||data,width=owner.rotation%180?owner.size.z:owner.size.x,depth=owner.rotation%180?owner.size.x:owner.size.z;
        root.scale.setScalar(table&&data.objectType==='plant' ? .7 : 1);
        root.position.set(data.grid.x+width/2+(table?x*Math.cos(angle)-z*Math.sin(angle):0),table ? .73 : 0,data.grid.z+depth/2+(table?x*Math.sin(angle)+z*Math.cos(angle):0));root.rotation.y=-(data.rotation+(table?.rotation||0))*Math.PI/180;
      }
    }
    sync(h){
      this.house=h;const seen=new Set(),all=[...h.structure.floors.map(data=>({kind:'floor',data})),...h.structure.walls.map(data=>({kind:'wall',data})),...h.structure.doors.map(data=>({kind:'door',data})),...h.objects.map(data=>({kind:'object',data}))];
      for(const {kind,data} of all){
        seen.add(data.id);const signature=kind==='wall'?String(h.structure.doors.some(d=>d.wallId===data.id)):kind==='object'?data.objectType+(data.objectType==='custom'?':'+data.customState.model.id+':'+!!H.CustomModels.get(data.customState.model.id):''):kind;
        let entry=this.entries.get(data.id);
        if(entry&&entry.signature!==signature){this.scene.remove(entry.root);release(entry.root);this.entries.delete(data.id);entry=null;}
        if(!entry){
          const root=kind==='object'?this.makeFurniture(data.objectType,data):this.makeStructure(kind,data,h);
          root.traverse(n=>{if(n.isMesh)n.userData.entity={kind,id:data.id};});
          entry={kind,data,root,signature};this.entries.set(data.id,entry);this.scene.add(root);
        }
        if(data.objectType==='custom'&&!H.CustomModels.get(data.customState.model.id)&&!entry.modelLoading){
          entry.modelLoading=true;H.CustomModels.load(data.customState.model).then(()=>{if(!this.disposed)this.sync(this.house);}).catch(error=>{if(!this.disposed)this.emit('error',error.message);});
        }
        entry.data=data;this.placeRoot(entry.root,kind,data,h);
        if(kind==='object'&&data.interactionType==='LAMP'){
          if(!entry.lamp){const lamp=new THREE.PointLight('#ffe2a4',32,10,2);lamp.position.set(0,data.objectType==='floorlamp'?1.46:0,data.objectType==='floorlamp'?0:.4);lamp.shadow.mapSize.set(512,512);lamp.shadow.bias=-.001;lamp.shadow.normalBias=.035;lamp.shadow.camera.near=.08;lamp.shadow.camera.far=10;entry.root.add(lamp);entry.lamp=lamp;}
          const settings=data.customState.light||{on:true,brightness:1};entry.lamp.intensity=settings.on?32*settings.brightness:0;entry.lamp.visible=settings.on&&settings.brightness>0;
          entry.root.traverse(n=>{if(n.userData.bulb){n.material.emissive.set('#ffcf7e');n.material.emissiveIntensity=settings.on?settings.brightness*(n.userData.shade?.3:1.5):0;}});
        }
        if(kind==='object'&&data.objectType==='plant')entry.root.traverse(n=>{if(n.userData.leaf){n.material.color.set(data.customState.growth?.score===0?'#8b7256':H.Catalog.plant.color);n.rotation.z=data.customState.growth?.score===0?Math.sign(n.position.x)*1.3:n.position.x*3;}});
        if(kind==='object'&&data.objectType==='art'&&data.customState.image!==entry.imageData){
          entry.imageData=data.customState.image;const picture=entry.root.userData.picture;
          picture.userData.ownedMap?.dispose();picture.userData.ownedMap=null;picture.material.map=null;picture.material.color.set('#f4dfb9');picture.scale.set(1,1,1);
          if(entry.imageData)new THREE.TextureLoader().load(entry.imageData,texture=>{
            if(this.entries.get(data.id)!==entry||entry.imageData!==data.customState.image){texture.dispose();return;}
            const aspect=texture.image.width/texture.image.height,frameAspect=.42/.34;
            picture.scale.set(Math.min(1,aspect/frameAspect),Math.min(1,frameAspect/aspect),1);
            texture.colorSpace=THREE.SRGBColorSpace;picture.material.color.set('#ffffff');picture.material.map=texture;picture.userData.ownedMap=texture;picture.material.needsUpdate=true;
          });
          picture.material.needsUpdate=true;
        }
        if(kind!=='object'){
          const m=h.materials[data.id]||H.DefaultMaterials[kind];
          entry.root.traverse(n=>{if(n.userData.paintable){n.material.color.set(m.color);n.material.roughness=H.Finishes[m.finish].roughness;n.material.map=this.finishTexture(m.finish);n.material.needsUpdate=true;}});
        }
      }
      for(const [id,entry] of this.entries)if(!seen.has(id)){this.scene.remove(entry.root);release(entry.root);this.entries.delete(id);}
      // Limit shadow maps, not light output; every placed lamp still illuminates the room.
      let shadows=0;for(const entry of this.entries.values())if(entry.lamp){const cast=entry.lamp.visible&&shadows++<3;if(entry.lamp.castShadow&&!cast){entry.lamp.shadow.map?.dispose();entry.lamp.shadow.map=null;}entry.lamp.castShadow=cast;}
      this.selection.clear();this.hoverSelection.clear();this.origin.visible=this.state.editing&&!h.structure.floors.length;this.scene.updateMatrixWorld(true);
    }
    setState(state){
      this.state=state;this.grid.visible=state.editing;this.origin.visible=state.editing&&!this.house.structure.floors.length;
      this.canvas.dataset.tool=state.tool.toLowerCase();
      this.clearGhost();this.selection.clear();this.hoverSelection.clear();if(state.selected)this.selection.show(this.selectionEntry(state.selected));
    }
    setLighting(level){
      const fill=Math.min(.45,[...this.entries.values()].reduce((sum,e)=>sum+(e.lamp?.intensity||0)/32*.2,0));this.ambient.intensity=.08+2.42*level+fill*(1-level);this.sun.intensity=.04+2.66*level;
      this.ambient.color.set(level<.3?'#9aafd0':'#fffaf0');this.renderer.toneMappingExposure=.6+.65*level;
      this.grid.material.color.set(level<.35?'#c4d4ee':'#a5b09c');this.grid.material.opacity=level<.35?.65:.42;
    }
    windowSkyTexture(){
      if(this.textures.has('window-sky'))return this.textures.get('window-sky');
      this.windowSky=document.createElement('canvas');this.windowSky.width=256;this.windowSky.height=144;
      this.windowSkyContext=this.windowSky.getContext('2d');
      const texture=new THREE.CanvasTexture(this.windowSky);texture.colorSpace=THREE.SRGBColorSpace;this.textures.set('window-sky',texture);
      this.weatherDirty=true;this.drawWeather(performance.now());return texture;
    }
    setWeather(weather,level){
      if(this.weather.kind!==weather.kind||Math.round(this.weather.level*100)!==Math.round(level*100)||(this.weather.level<.3)!==(level<.3))this.weatherDirty=true;
      this.weather={kind:weather.kind,level};this.weatherCanvas.dataset.weather=weather.kind;
    }
    paintWeather(ctx,w,h,time,pane=false){
      const {kind,level}=this.weather,night=level<.3;
      ctx.clearRect(0,0,w,h);
      if(pane){
        const sky=ctx.createLinearGradient(0,0,0,h);
        sky.addColorStop(0,night?'#26374f':kind==='sunny'?'#83bcda':kind==='rain'?'#718ea2':'#aec5d6');
        sky.addColorStop(1,night?'#59748c':kind==='sunny'?'#d9eef2':'#d8e2e6');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      }
      if(kind==='sunny'){
        const x=w*(pane?.24:.14),y=h*(pane?.3:.18),r=pane?17:Math.min(w,h)*.035;
        const glow=ctx.createRadialGradient(x,y,r*.2,x,y,r*4);
        glow.addColorStop(0,night?'#dce8ff55':'#fff0b685');glow.addColorStop(1,'#fff4ce00');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
        ctx.fillStyle=night?'#e4ecf4':'#fff3ba';ctx.beginPath();
        if(night){ctx.arc(x,y,r,-Math.PI/2,Math.PI/2);ctx.quadraticCurveTo(x-r*.25,y,x,y-r);}else ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fill();return;
      }
      if(!pane){
        const mist=ctx.createLinearGradient(0,0,0,h);mist.addColorStop(0,kind==='rain'?'#52698226':'#c7dce526');mist.addColorStop(1,'#a5bdd000');ctx.fillStyle=mist;ctx.fillRect(0,0,w,h);
      }
      // Fixed seeds keep the drift gentle and continuous; no per-frame randomness.
      const count=pane?(kind==='rain'?20:15):Math.min(110,Math.max(45,Math.round(w*h/14000)));
      for(let i=0;i<count;i++){
        const seed=((i*73+19)%101)/101,offset=((i*37+11)%103)/103;
        const speed=kind==='rain'?(pane?65:180)+(seed*90):(pane?13:22)+seed*24;
        const y=(offset*(h+40)+time*speed)%(h+40)-20;
        const drift=kind==='snow'?Math.sin(time*.55+i)*w*.014:-y*.08;
        const x=((seed*w+drift+w)%w);
        if(kind==='rain'){
          ctx.strokeStyle=pane?'#e5f4ffc9':night?'#bed5ee9c':'#51718e85';ctx.lineWidth=pane?2.8:1.5;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+(pane?17:18+seed*12));ctx.stroke();
        }else{
          const radius=pane?3+seed*2:1.6+seed*2.4;
          ctx.fillStyle='#f4fbfff0';ctx.strokeStyle='#86a3b05c';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
        }
      }
    }
    drawWeather(now){
      const still=this.weatherMotion.matches||this.weather.kind==='sunny';
      if(!this.weatherDirty&&(still||now-(this.lastWeatherFrame||0)<50))return;
      this.lastWeatherFrame=now;this.weatherDirty=false;
      const time=this.weatherMotion.matches?0:now/1000;
      this.paintWeather(this.weatherContext,this.weatherCanvas.width,this.weatherCanvas.height,time);
      if(this.windowSky){this.paintWeather(this.windowSkyContext,256,144,time,true);this.textures.get('window-sky').needsUpdate=true;}
    }
    resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.controls.resize(w,h);this.weatherCanvas.width=w;this.weatherCanvas.height=h;this.weatherDirty=true;}
    hit(clientX,clientY){
      const rect=this.canvas.getBoundingClientRect(),mouse=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(mouse,this.camera);
      const ground=this.raycaster.ray.intersectPlane(this.plane,new THREE.Vector3());
      let grid=ground?G.cell(ground):{x:999,y:0,z:999};
      const roots=[...this.entries.values()].filter(e=>{
        if(this.state.movingId&&(e.data.id===this.state.movingId||e.data.supportId===this.state.movingId))return false;
        if(!this.state.editing)return e.kind==='object'||e.kind==='door';
        if(this.state.layer==='OBJECT')return e.kind==='object'||(this.state.tool==='PLACE'&&H.Catalog[this.state.furniture]?.placement==='WALL'&&e.kind==='wall');
        if(this.state.tool==='PLACE'&&this.state.build==='floor')return e.kind==='floor';
        if(this.state.tool==='PLACE'&&this.state.build==='door')return ['door','wall'].includes(e.kind);
        return e.kind!=='object';
      }).map(e=>e.root);
      if(this.house.animal.placed&&this.state.editing&&this.state.layer==='OBJECT'&&this.state.movingId!=='pip')roots.push(this.animalMesh);
      const onHouse=this.raycaster.intersectObjects([...this.entries.values()].map(e=>e.root),true).length>0;
      const intersect=this.raycaster.intersectObjects(roots,true).find(hit=>hit.object.userData.entity);
      const entity=intersect?.object.userData.entity||null,entry=entity?this.entries.get(entity.id):null;
      if(entity?.kind==='animal')grid={...this.house.animal.grid};
      let wall=null;
      if(entry?.kind==='wall')wall=entry.data;
      if(entry?.kind==='door')wall=this.house.structure.walls.find(w=>w.id===entry.data.wallId);
      if(entry?.kind==='object'&&entry.data.placement==='WALL')wall=this.house.structure.walls.find(w=>w.id===entry.data.attachedWallId);
      if(entry&&(entry.kind==='floor'||entry.kind==='object'))grid={...entry.data.grid,y:0};
      if(wall&&(this.state.build!=='floor'||H.Catalog[this.state.furniture]?.placement==='WALL'||this.state.tool!=='PLACE'))grid={...wall.grid};
      // R chooses the rear edge for structure previews; object mounting follows the hit wall.
      if(this.state.editing&&this.state.layer==='STRUCTURE'&&this.state.tool==='PLACE'&&this.state.build==='door'){
        wall=this.house.structure.walls.find(w=>G.edge(w.grid,w.side)===G.edge(grid,this.state.side))||null;
      }
      let supportId=null,supportSlot=null;
      if(entry?.kind==='object'){
        const table=H.isTable(entry.data)?entry:this.entries.get(entry.data.supportId);
        if(table){const local=table.root.worldToLocal(intersect.point.clone());supportId=table.data.id;const column=Math.max(0,Math.min(table.data.size.x-1,Math.floor(local.x+table.data.size.x/2))),center=column-(table.data.size.x-1)/2;supportSlot=column*4+(local.x>=center?1:0)+(local.z>=0?2:0);grid={...table.data.grid};}
      }
      return {grid,entity,supportId,supportSlot,wallId:wall?.id||null,side:this.state.side,rotation:this.state.buildRotation||0,onHouse:onHouse||entity?.kind==='animal'};
    }
    showGhost(kind,data,target,valid){
      this.clearGhost();let group;
      if(kind==='object')group=this.makeFurniture(data.objectType,data);
      else if(kind==='door'){group=new THREE.Group();box(group,.7,1.8,.07,0,.9,0,'#ffffff');}
      else group=this.makeStructure(kind,data,this.house);
      if(kind==='door'){
        const wall=this.house.structure.walls.find(w=>w.id===target.wallId)||{grid:target.grid,side:target.side};
        this.placeRoot(group,'wall',wall,this.house);
      }else if(kind==='object'&&data.placement==='WALL'&&!target.wallId){release(group);return;}
      else this.placeRoot(group,kind,data,this.house);
      group.traverse(n=>{if(n.isMesh){n.material.color.set(valid?'#5baa86':'#d1685e');n.material.transparent=true;n.material.opacity=.43;n.material.depthWrite=false;n.castShadow=false;n.renderOrder=10;if(kind==='floor')n.material.map=this.finishTexture('wood');}});
      this.ghost=group;this.scene.add(group);
    }
    clearGhost(){if(this.ghost){this.scene.remove(this.ghost);release(this.ghost);this.ghost=null;}}
    selectionEntry(entity){
      return entity?.kind==='animal'&&this.house.animal.placed?{data:this.house.animal,root:this.animalMesh}:this.entries.get(entity?.id);
    }
    highlight(target){
      this.selection.show(this.selectionEntry(this.state.selected));
      this.hoverSelection.show(target?.entity?.id===this.state.selected?.id?null:this.selectionEntry(target?.entity));
    }
    pointerMode(button,target){
      const s=this.state;
      if(button===1)return 'pan';
      if(button===2&&s.editing&&s.layer==='OBJECT'&&s.tool==='PLACE')return 'cancel';
      const canBuild=button===0&&s.editing&&s.layer==='STRUCTURE'&&s.tool==='PLACE'&&!new H.StructureSystem(this.house).preview(s.build,target);
      if(!target.onHouse&&!canBuild)return 'pan';
      if(s.editing&&s.layer==='STRUCTURE'&&(button===2||s.tool==='PLACE'||s.tool==='MATERIAL'))return 'stroke';
      return 'click';
    }
    strokeAt(x,y){
      const down=this.down;if(!down)return;
      const target=this.hit(x,y),key=G.key(target.grid)+':'+target.side;
      if(down.visited.has(key))return;
      down.visited.add(key);
      if(down.button===2&&!target.entity)return;
      if(down.button===0&&this.state.tool==='PLACE'&&new H.StructureSystem(this.house).preview(this.state.build,target))return;
      this.emit(down.button===2?'remove':'activate',target);
    }
    endPointer(){
      if(this.down?.mode==='stroke')this.emit('stroke-end');
      for(const id of this.activePointers.keys())if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
      this.down=null;this.activePointers.clear();this.gesture=false;this.canvas.classList.remove('is-panning');
    }
    bind(){
      const opts={signal:this.events.signal},canvas=this.canvas;
      canvas.addEventListener('pointerdown',e=>{
        if(![0,1,2].includes(e.button))return;
        e.preventDefault();canvas.focus({preventScroll:true});
        const target=this.hit(e.clientX,e.clientY),mode=this.pointerMode(e.button,target);
        if(mode==='cancel'){this.emit('cancel-tool');return;}
        canvas.setPointerCapture(e.pointerId);this.activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.activePointers.size>1){
          if(this.down?.mode==='stroke')this.emit('stroke-end');this.down=null;this.gesture=true;this.clearGhost();
          const ps=[...this.activePointers.values()];this.pinch=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);return;
        }
        this.down={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button,mode,moved:false,visited:new Set()};
        if(mode==='stroke'){
          this.emit('stroke-start');if(e.pointerType!=='touch')this.strokeAt(e.clientX,e.clientY);
        }
      },opts);
      canvas.addEventListener('pointermove',e=>{
        if(this.activePointers.has(e.pointerId))this.activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.gesture){
          if(this.activePointers.size===2){
            const ps=[...this.activePointers.values()],distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
            if(this.pinch>0)this.controls.zoom(distance/this.pinch);this.pinch=distance;
          }
          return;
        }
        const d=this.down;
        if(d&&d.id===e.pointerId){
          if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6)d.moved=true;
          if(d.mode==='pan'&&d.moved){
            this.controls.pan(e.clientX-d.lastX,e.clientY-d.lastY);this.clearGhost();canvas.classList.add('is-panning');
          }else if(d.mode==='stroke'){
            // Sample between events so fast drags do not skip grid cells.
            const steps=Math.max(1,Math.ceil(Math.hypot(e.clientX-d.lastX,e.clientY-d.lastY)/5));
            for(let i=1;i<=steps;i++)this.strokeAt(d.lastX+(e.clientX-d.lastX)*i/steps,d.lastY+(e.clientY-d.lastY)*i/steps);
          }
          if(d.moved||d.mode!=='pan'){d.lastX=e.clientX;d.lastY=e.clientY;}
          if(d.mode==='pan'&&d.moved)return;
        }
        this.pointer={x:e.clientX,y:e.clientY};this.emit('hover',this.hit(e.clientX,e.clientY));
      },opts);
      canvas.addEventListener('pointerup',e=>{
        const down=this.down;
        if(this.gesture){this.activePointers.delete(e.pointerId);if(!this.activePointers.size)this.endPointer();return;}
        if(!down||down.id!==e.pointerId)return;
        if(down.mode==='stroke')this.strokeAt(e.clientX,e.clientY);
        else if(!down.moved&&down.button!==1){
          if(down.mode==='pan')this.emit('activate',{...this.hit(e.clientX,e.clientY),entity:null});
          else this.emit(down.button===2?'remove':'activate',this.hit(e.clientX,e.clientY));
        }
        this.endPointer();
      },opts);
      canvas.addEventListener('pointercancel',()=>this.endPointer(),opts);
      canvas.addEventListener('lostpointercapture',e=>{if(this.down?.id===e.pointerId)this.endPointer();},opts);
      window.addEventListener('blur',()=>this.endPointer(),opts);
      canvas.addEventListener('pointerleave',()=>{if(!this.down){this.pointer=null;this.emit('hover',null);}},opts);
      canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts);
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.controls.zoom(Math.exp(-e.deltaY*.0015));},{...opts,passive:false});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.emit('error','3D rendering paused. Export a backup, then reload the page.');},opts);
    }
    render(animal){
      this.drawWeather(performance.now());
      this.animalMesh.visible=animal.visible;
      if(animal.visible){
        this.animalMesh.position.set(animal.position.x,(animal.position.y||0)+(animal.moving?Math.sin(animal.elapsed*12)*.022:0),animal.position.z);
        this.animalMesh.rotation.y=animal.heading;const sleeping=animal.state==='Sleeping',sitting=animal.state==='Sitting';
        this.animalMesh.scale.set(1,sleeping?.55:sitting?.78:1,sleeping?1.2:1);
      }
      const signature=animal.path.map(p=>G.key(p)).join(';');
      if(this.pathSignature!==signature){
        const points=[animal.position,...animal.path.map(p=>G.world(p))].map(p=>new THREE.Vector3(p.x,.025,p.z));
        this.pathLine.geometry.dispose();this.pathLine.geometry=new THREE.BufferGeometry().setFromPoints(points);this.pathSignature=signature;
      }else{
        const positions=this.pathLine.geometry.getAttribute('position');
        if(positions){positions.setXYZ(0,animal.position.x,.025,animal.position.z);positions.needsUpdate=true;}
      }
      this.pathLine.visible=false;
      this.renderer.render(this.scene,this.camera);
    }
    destroy(){
      this.disposed=true;this.thumbnailRenderer?.dispose();this.thumbnailRenderer?.forceContextLoss();this.events.abort();this.observer.disconnect();this.selection.clear();this.hoverSelection.clear();this.clearGhost();release(this.scene);
      for(const texture of this.textures.values())texture.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();this.weatherCanvas.remove();
    }
  }
  Object.assign(H,{SceneView,SelectionSystem});
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
