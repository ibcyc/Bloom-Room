/* The only orchestration layer. UI emits actions; domain systems validate; SceneView renders. */
(function(H){
  'use strict';
  const E=H.escape;
  class HouseEditor {
    constructor(root,options){
      this.root=root;this.options=options;this.repository=new H.SaveSystem(options.roomId);
      const loaded=this.repository.load();this.house=loaded.house;this.saved=loaded.saved;this.dirty=loaded.dirty;
      this.undoStack=[];this.redoStack=[];this.disposed=false;this.lastHover=null;this.events=new AbortController();
      this.state={editing:false,layer:'STRUCTURE',tool:'SELECT',build:null,side:'N',furniture:null,rotation:0,height:1.5,finish:'wood',color:'#c6a276',selected:null,textureOpen:false,...H.EditorPreferences.load()};
      this.state.side=this.state.buildRotation%180?'W':'N';
      this.bindSystems();this.ui=new H.HouseUI(root,this);this.interactions=new H.InteractionSystem(this,options.members);
      this.sound=new H.SoundSystem(()=>this.house,()=>this.interactions.musicStatus(),options.roomId);
      this.animal=new H.AnimalSystem(this.house);
      try{this.scene=new H.SceneView(root.querySelector('#house-stage'),this.house,(action,target)=>this.sceneIntent(action,target));}
      catch(error){root.querySelector('#house-stage').innerHTML='<div class="house-render-error" role="alert"><h2>3D view unavailable</h2><p>'+E(error.message)+'</p><p>Use a WebGL 2 capable browser. Your house data is safe; JSON export remains available.</p></div>';}
      this.tasks=new H.PersonalTaskSystem(this);this.render();this.sound.autoStart();
      if(!this.updateLife())this.persistRuntime();
      if(loaded.notice)this.ui.message(loaded.notice);
      this.lifeTimer=setInterval(()=>{this.updateLife();this.updateRoomTime();},1000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.updateLife();this.updateRoomTime();}},{signal:this.events.signal});
      window.addEventListener('beforeunload',e=>{if(this.dirty){this.repository.draft(this.house);e.preventDefault();e.returnValue='';}},{signal:this.events.signal});
      window.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&!this.root.querySelector('#house-pet-panel').hidden){this.ui.petOpen(false);return;}
        if(e.key==='Escape'&&this.root.querySelector('.house-art-preview')){this.ui.closeArt();return;}
        if(!this.state.editing||this.ui.modal.open||e.target.closest('input:not([type=range]):not([type=checkbox]),textarea,[contenteditable]'))return;
        if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
          e.preventDefault();this.scene?.endPointer();this.dispatch(e.shiftKey?'redo':'undo');return;
        }
        if(e.ctrlKey||e.metaKey||e.altKey)return;
        // IMEs can report "Process" or a composing character in key. Editing
        // uses physical keys; text fields and dialogs are excluded above.
        const shortcut=e.code||'Key'+e.key.toUpperCase();
        if(shortcut==='KeyM'){e.preventDefault();this.dispatch('move');}
        if(shortcut==='KeyR'){e.preventDefault();this.dispatch('rotate');}
        if(e.key==='Escape'){e.preventDefault();this.scene?.endPointer();this.sceneIntent('cancel-tool');}
      },{signal:this.events.signal});
      this.previousTime=performance.now();
      const tick=time=>{
        if(this.disposed)return;
        const dt=Math.min((time-this.previousTime)/1000,.1);this.previousTime=time;
        if(!document.hidden){this.animal.update(dt,Date.now(),!this.state.editing);this.consumeAnimalEvents();const view=this.animal.view();this.scene?.render(view);this.tasks.position(view);}
        this.frame=requestAnimationFrame(tick);
      };
      this.frame=requestAnimationFrame(tick);
    }
    bindSystems(){this.structure=new H.StructureSystem(this.house);this.objects=new H.ObjectSystem(this.house);this.materials=new H.MaterialSystem(this.house);}
    persistRuntime(){
      try{
        if(this.dirty){if(!this.repository.draft(this.house))throw new Error('Pip’s latest state could not be saved in this browser.');}
        else{const saved=this.repository.save(this.house);this.house.metadata=saved.metadata;this.saved=H.clone(saved);}
      }catch(error){this.ui.message(error.message,true);}
    }
    updateLife(){
      this.animal.checkVitals();const changed=this.consumeAnimalEvents();
      this.ui.animal(H.AnimalSystem.status(this.house.animal));return changed;
    }
    consumeAnimalEvents(){
      const events=this.animal.takeEvents();if(!events.length)return false;
      // Editing history must not restore consumed food or rewind the same cat's care clock.
      for(const event of events)for(const snapshot of [...this.undoStack,...this.redoStack]){
        if(snapshot.animal.lifeId!==event.lifeId)continue;
        if(event.type==='fed'){snapshot.objects=snapshot.objects.filter(o=>o.id!==event.bowlId);snapshot.animal.lastFedAt=event.lastFedAt;}
        else{snapshot.animal.placed=false;snapshot.animal.health=0;snapshot.animal.absentSince=this.house.animal.absentSince;}
      }
      this.bindSystems();this.scene?.sync(this.house);
      if(this.state.selected&&!this.entity(this.state.selected))this.state.selected=null;
      this.render();this.ui.animal(H.AnimalSystem.status(this.house.animal));this.persistRuntime();return true;
    }
    remember(){H.EditorPreferences.save(this.state);}
    clearPlacement(){this.state.tool='SELECT';this.state.build=null;this.state.furniture=null;this.state.artImage=null;this.state.customObject=null;this.state.movingId=null;this.state.textureOpen=false;this.lastHover=null;}
    render(){this.ui.render(this.state,this.house,this.dirty);this.ui.hint('');this.scene?.setState(this.state);this.updateRoomTime();if(this.state.editing&&this.state.tool==='PLACE'&&this.lastHover)this.sceneIntent('hover',this.lastHover);}
    applyLighting(lighting=this.lightPreview||this.house.lighting){
      const level=H.HouseFeatures.lightLevel(lighting),sky=H.HouseFeatures.skyColor(lighting);
      this.scene?.setLighting(level);this.scene?.setWeather(this.house.weather,level);this.root.style.backgroundColor='rgb('+sky.join(',')+')';this.root.classList.toggle('is-night',level<.35);this.root.dataset.lightMode=lighting.mode;this.root.dataset.weather=this.house.weather.kind;this.root.style.setProperty('--sky-mood-blend',String(level*.65));
      return level;
    }
    preserveGrowth(){for(const snapshot of [...this.undoStack,...this.redoStack])for(const o of snapshot.objects){const live=this.house.objects.find(p=>p.id===o.id&&p.objectType==='plant');if(live&&live.customState.growth.placedAt===o.customState.growth?.placedAt)o.customState.growth=H.clone(live.customState.growth);}}
    settleChores(){if(H.HouseChores.settle(this.house)){this.preserveGrowth();this.scene?.sync(this.house);this.persistRuntime();if(this.interactions.view==='plant'&&this.ui.modal.open&&this.ui.modal.querySelector('.house-growth'))this.interactions.plant();}}
    updateRoomTime(){
      this.settleChores();
      const changed=H.HouseFeatures.advanceWeather(this.house);
      // Geometry undo must not rewind the outside weather or its saved clock.
      for(const snapshot of [...this.undoStack,...this.redoStack])snapshot.weather=H.clone(this.house.weather);
      if(changed)this.persistRuntime();
      this.applyLighting();this.interactions.lightStatus();this.interactions.applianceStatus();this.interactions.arrangementStatus();this.tasks?.tick();
    }
    refresh(nav=true){
      this.bindSystems();this.scene?.sync(this.house);
      this.sound?.sync();
      if(nav)this.animal.rebuild(this.house);else{this.animal.house=this.house;this.animal.nav.house=this.house;}
      if(this.state.selected&&!this.entity(this.state.selected))this.state.selected=null;
      this.render();
    }
    entity(selected){if(!selected)return null;return selected.kind==='animal'?(this.house.animal.placed?this.house.animal:null):selected.kind==='object'?this.house.objects.find(o=>o.id===selected.id):this.house.structure[selected.kind==='floor'?'floors':selected.kind==='wall'?'walls':'doors'].find(o=>o.id===selected.id);}
    mutate(fn,message,nav=true){
      this.settleChores();const before=H.clone(this.house);
      try{fn();this.house=H.HouseModel.validate(this.house);}catch(error){this.house=before;this.refresh(nav);throw error;}
      if(!this.stroke?.changed){this.undoStack.push(before);if(this.stroke)this.stroke.changed=true;}if(this.undoStack.length>30)this.undoStack.shift();this.redoStack=[];this.dirty=true;
      this.preserveGrowth();this.refresh(nav);const stored=this.repository.draft(this.house);
      this.ui.message(message+(stored?'':' Draft storage is unavailable; export a backup.'));
    }
    save(){
      const saved=this.repository.save(this.house);this.house.metadata=saved.metadata;this.saved=H.clone(saved);this.dirty=false;this.render();this.ui.message('House saved.');
    }
    preview(target){
      if(!target)return null;
      const s=this.state;
      if(s.layer==='STRUCTURE'&&!s.build)return null;
      if(s.layer==='STRUCTURE')return {kind:s.build,data:{id:'preview',grid:{...target.grid,y:0},side:s.side,rotation:s.buildRotation},error:this.structure.preview(s.build,target)};
      if(!s.furniture)return null;
      const data=s.movingId&&s.movingId!=='pip'?this.objects.moveCandidate(s.movingId,target,s.rotation,s.height):this.objects.candidate(s.furniture,target,s.rotation,s.height,s.customObject);
      if(s.furniture==='art'&&s.artImage)data.customState.image=s.artImage;
      return {kind:'object',data,error:H.CollisionValidator.object(this.house,data,s.movingId)};
    }
    sceneIntent(action,target){
      try{
        if(action==='stroke-start'){this.stroke={changed:false};return;}
        if(action==='stroke-end'){
          const placed=this.stroke?.changed&&this.state.layer==='STRUCTURE'&&this.state.tool==='PLACE';this.stroke=null;
          if(placed){this.clearPlacement();this.render();}return;
        }
        if(action==='hover'){
          this.lastHover=target;this.scene?.highlight(target);
          if(!target){this.scene?.clearGhost();this.ui.hint('');return;}
          if(this.state.editing&&this.state.tool==='PLACE'){
            const preview=this.preview(target);
            if(preview){this.scene?.showGhost(preview.kind,preview.data,target,!preview.error);this.ui.hint(preview.error||'Ready to place · ('+target.grid.x+', '+target.grid.z+')');}
          }else{
            this.scene?.clearGhost();const entity=target.entity&&this.entity(target.entity);
            this.ui.hint(entity?(target.entity.kind==='animal'?'Pip':target.entity.kind==='object'?H.Catalog[entity.objectType].name:target.entity.kind)+' · '+target.grid.x+', '+target.grid.z:'');
          }
          return;
        }
        if(action==='error'){this.ui.message(target,true);return;}
        if(action==='rotate'){this.dispatch('rotate');return;}
        if(action==='cancel-tool'){this.clearPlacement();this.render();this.ui.message('Select an item, or choose a new tool.');return;}
        if(action==='activate')this.activate(target);
        if(action==='remove'&&this.state.editing)this.remove(target);
      }catch(error){this.ui.message(error.message,true);}
    }
    activate(target){
      const s=this.state;if(s.textureOpen){s.textureOpen=false;this.render();}
      if(!s.editing){
        if(target.entity?.kind==='object')this.interactions.open(this.entity(target.entity));
        else if(target.entity?.kind==='door')this.interactions.door();
        return;
      }
      if(s.tool==='MATERIAL'){
        if(!target.entity||['object','animal'].includes(target.entity.kind))throw new Error('Select a floor, wall, or door to paint.');
        this.mutate(()=>this.materials.paint(target.entity.id,s.finish,s.color),'Texture applied.',false);return;
      }
      if(s.tool==='PLACE'){
        if(s.layer==='STRUCTURE'){
          let removed=[];this.mutate(()=>{removed=this.structure.place(s.build,target);},'Structure placed.');if(removed.length)this.ui.message(removed.length+' unsupported or overlapping item(s) removed.');
        }else{
          if(!s.furniture)throw new Error('Click ＋ to choose an object first.');
          const placed=this.preview(target);if(placed?.error)throw new Error(placed.error);
          this.mutate(()=>{const object=s.movingId?this.objects.move(s.movingId,target,s.rotation,s.height):this.objects.place(s.furniture,target,s.rotation,s.height,s.customObject);if(!s.movingId&&s.furniture==='art'&&s.artImage)object.customState.image=s.artImage;},s.movingId?'Object moved.':'Item placed. Click ＋ to add another object.');
          this.clearPlacement();this.render();
        }
        return;
      }
      s.selected=target.entity;this.render();
    }
    remove(target){
      if(this.state.tool==='MATERIAL'){
        if(!target.entity||['object','animal'].includes(target.entity.kind))throw new Error('Select a structure to restore its default texture.');
        this.mutate(()=>this.materials.reset(target.entity.id),'Default texture restored.',false);return;
      }
      if(this.state.layer==='OBJECT'&&this.state.tool==='PLACE'){this.sceneIntent('cancel-tool');return;}
      const entity=target.entity;if(!entity){this.state.selected=null;this.render();return;}
      if(this.state.layer==='OBJECT'){
        if(!['object','animal'].includes(entity.kind))throw new Error('Choose an item in the Object layer.');
        this.mutate(()=>this.objects.remove(entity.id),'Item removed.');
      }else{
        if(['object','animal'].includes(entity.kind))throw new Error('Switch to Object to remove this item.');
        let removed=[];this.mutate(()=>{removed=this.structure.remove(entity.kind,entity.id);},'Structure removed.');
        if(removed.length)this.ui.message(removed.length+' unsupported item(s) removed.');
      }
    }
    async importModel(p){
      const size={x:Number(p.width),y:Number(p.height),z:Number(p.depth)};
      if(!['x','z'].every(k=>Number.isInteger(size[k])&&size[k]>=1&&size[k]<=20)||!Number.isFinite(size.y)||size.y<=0||size.y>3)throw new Error('Width and depth must be 1–20 cells; height must be greater than 0 and at most 3 cells.');
      if(this.modelImporting)return;this.modelImporting=true;const form=this.ui.modal.querySelector('[data-h-form="model-import"]'),submit=form?.querySelector('[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Importing…';}
      try{const model=await H.CustomModels.upload(p.file);if(this.disposed||!this.state.editing||!this.ui.modal.open||!form?.isConnected)return;
        this.clearPlacement();Object.assign(this.state,{layer:'OBJECT',tool:'PLACE',furniture:'custom',rotation:0,customObject:{model,size},selected:null});this.ui.closeModal();this.render();this.ui.message('Place '+model.name+'. R rotates; Esc cancels.');
      }finally{this.modelImporting=false;if(submit){submit.disabled=false;submit.textContent='Import & place';}}
    }
    async dispatch(action,payload={}){
      const s=this.state;
      try{
        if(action==='personal-open'){if(!s.editing)this.tasks.open(payload.key);return;}
        if(action==='personal-complete'){if(!s.editing)this.tasks.complete(payload.key);return;}
        if(['light-mode','light-level','weather'].includes(action)){if(!s.editing)await this.interactions.action(action,payload);return;}
        if(/^(fridge-|trash-|laundry-|task-|request-|music-|upload-|bill-|lamp-|arrangement-)/.test(action)||['door-visibility','art-empty'].includes(action)){
          if(s.editing&&!['upload-art','art-empty'].includes(action))return;
          await this.interactions.action(action,payload);return;
        }
        switch(action){
          case 'edit':this.ui.closeArt();this.clearPlacement();s.editing=true;this.animal.rebuild(this.house);this.render();this.ui.message('Choose Object or Structure. Use Help for controls.');break;
          case 'setting':{
            const {key,value}=payload;
            if(key==='layer'){this.clearPlacement();s.layer=value==='OBJECT'?'OBJECT':'STRUCTURE';s.selected=null;}
            else if(key==='build'&&['wall','door','floor'].includes(value)){s.build=value;s.tool='PLACE';s.furniture=null;s.selected=null;s.textureOpen=false;}
            else if(key==='height'&&[1,1.5,2].includes(Number(value)))s.height=Number(value);
            else if(key==='objectHeight'&&s.selected)this.mutate(()=>this.objects.setHeight(s.selected.id,Number(value)),'Mount height updated.');
            else if(key==='finish'&&Object.hasOwn(H.Finishes,value)){s.finish=value;s.color=H.Finishes[value].color;}
            else if(key==='color'&&/^#[0-9a-f]{6}$/i.test(value))s.color=value;
            this.remember();if(!['height','objectHeight'].includes(key))this.lastHover=null;this.render();break;
          }
          case 'select-mode':this.clearPlacement();this.render();break;
          case 'texture':s.layer='STRUCTURE';s.textureOpen=!s.textureOpen;s.tool=s.textureOpen?'MATERIAL':'SELECT';s.build=null;s.furniture=null;s.selected=null;this.remember();this.render();break;
          case 'model-setup':if(s.editing)this.ui.modelSetup();break;
          case 'model-import':if(s.editing)await this.importModel(payload);break;
          case 'catalog':if(s.layer==='OBJECT')this.ui.catalog(this.house);break;
          case 'choose-object':{
            const type=payload.id;if(!Object.hasOwn(H.Catalog,type))throw new Error('Choose a valid object.');
            if(type==='cat'&&this.house.animal.placed)throw new Error('Only one cat can live here.');
            s.movingId=null;s.layer='OBJECT';s.tool='PLACE';s.build=null;s.furniture=type;s.artImage=null;s.customObject=null;s.rotation=0;s.textureOpen=false;s.selected=null;this.lastHover=null;
            if(type==='custom'){this.clearPlacement();this.ui.modelSetup();break;}
            if(type==='art'){this.render();this.interactions.artSetup();break;}
            this.ui.closeModal();this.render();this.ui.message('Place '+H.Catalog[type].name+'. Esc or right-click cancels.');break;
          }
          case 'move':{
            if(!s.editing||s.tool==='PLACE')break;const o=['object','animal'].includes(s.selected?.kind)&&this.entity(s.selected);if(!o){this.ui.message('Select an object, then press M.');break;}
            s.layer='OBJECT';s.tool='PLACE';s.build=null;s.furniture=s.selected.kind==='animal'?'cat':o.objectType;s.movingId=o.id;s.rotation=o.rotation||0;s.height=o.height||1.5;s.artImage=null;s.textureOpen=false;
            this.lastHover={grid:{...o.grid},wallId:o.attachedWallId,supportId:o.supportId,supportSlot:o.supportSlot};this.render();this.scene?.canvas.focus({preventScroll:true});this.ui.message('Move '+H.Catalog[s.furniture].name+' · click a new position. R rotates. Esc cancels.');break;
          }
          case 'rotate':{
            if(s.tool==='PLACE'&&s.layer==='STRUCTURE'){
              s.buildRotation=(s.buildRotation+90)%360;s.side=s.buildRotation%180?'W':'N';this.remember();this.render();
              const target=this.scene?.pointer?this.scene.hit(this.scene.pointer.x,this.scene.pointer.y):this.lastHover;
              if(target)this.sceneIntent('hover',target);this.ui.message('Preview rotated '+s.buildRotation+'°.');break;
            }
            if(s.tool==='PLACE'&&s.furniture){
              if(s.furniture==='cat')break;
              s.rotation=(s.rotation+90)%360;this.render();if(this.lastHover)this.sceneIntent('hover',this.lastHover);break;
            }
            const entity=s.selected?.kind==='object'?s.selected:this.lastHover?.entity;
            if(entity?.kind==='object'){s.selected=entity;this.mutate(()=>this.objects.rotate(entity.id),'Object rotated 90°.');}
            break;
          }
          case 'frame':this.scene?.controls.frame(this.house);break;
          case 'help':this.ui.help();break;
          case 'pet-status':this.updateLife();this.ui.petOpen(this.root.querySelector('#house-pet-panel').hidden);break;
          case 'close-pet':this.ui.petOpen(false);break;
          case 'arrangement':if(!s.editing)this.interactions.arrangement();break;
          case 'member-info':this.interactions.memberInfo(payload.id);break;
          case 'pip-mute':this.tasks.setMuted(payload.value);this.updateLife();break;
          case 'pip-volume':this.tasks.setMeowVolume(Number(payload.value)/100);this.updateLife();break;
          case 'pip-preview':await this.tasks.previewMeow();break;
          case 'member':this.interactions.inbox(payload.id);break;
          case 'save':this.save();s.editing=false;s.selected=null;this.clearPlacement();this.render();break;
          case 'export':{
            this.exportHouse=await H.MediaStore.pack(this.house);const json=H.ImportExportSystem.serialize(this.exportHouse);
            this.ui.dialog('Your complete house, in one file.','<p>This includes structure, objects, textures, object settings and Pip. The same JSON can be imported or used as a default preset.</p><textarea class="house-json-preview" aria-label="Exported house JSON" readonly rows="8">'+E(json)+'</textarea><div class="house-dialog-actions"><button class="house-primary" data-h-action="download-json">Download .json</button><button data-h-action="copy-json">Copy JSON</button></div>');break;
          }
          case 'download-json':H.ImportExportSystem.download(this.exportHouse||this.house);this.ui.message('House JSON download requested. The export preview is also available to copy.');break;
          case 'copy-json':{
            const text=this.ui.modal.querySelector('.house-json-preview');text.focus();text.select();
            if(navigator.clipboard)navigator.clipboard.writeText(text.value).then(()=>this.ui.message('House JSON copied.')).catch(()=>this.ui.modalError('Press Ctrl/Cmd+C to copy the selected JSON.'));
            else this.ui.modalError('Press Ctrl/Cmd+C to copy the selected JSON.');break;
          }
          case 'import':this.ui.dialog('Bring a house with you.','<p>Import a complete Bloom Room house JSON. We validate it before changing this draft.</p><label class="house-file-label">Choose a house file<input id="house-import-file" type="file" accept=".json,application/json"></label><details><summary>Or paste JSON</summary><form data-h-form="preview-import" class="house-interaction-form"><textarea aria-label="House JSON" name="text" rows="6" required></textarea><button type="submit">Validate JSON</button></form></details>');break;
          case 'preview-import':{
            this.pendingImport=H.ImportExportSystem.parse(payload.text);
            const h=this.pendingImport;this.ui.dialog('This house is ready to import.','<p>'+h.structure.floors.length+' floor cells · '+h.structure.walls.length+' walls · '+h.structure.doors.length+' doors<br>'+h.objects.length+' placed objects'+(h.animal.placed?' · Pip':'')+'</p><p>Import replaces the current draft. Use Ctrl/Cmd+Z to undo it.</p><button class="house-primary" data-h-action="confirm-import">Import this house</button>');break;
          }
          case 'confirm-import':if(this.pendingImport&&!this.importing){this.importing=true;try{const imported=await H.MediaStore.hydrate(this.pendingImport);this.mutate(()=>{this.house=imported;},'House imported as a draft. Save to keep it.');this.pendingImport=null;this.clearPlacement();s.selected=null;this.render();this.scene?.controls.frame(this.house);this.ui.closeModal();}finally{this.importing=false;}}break;
          case 'new-house':this.ui.dialog('A fresh floor plan.','<p>Start blank, or use the default furnished house. This replaces your draft and can be undone.</p><div class="house-dialog-actions"><button data-h-action="reset-house" data-value="empty">Start empty</button><button data-h-action="reset-house" data-value="basic">Use default house</button></div>');break;
          case 'reset-house':this.mutate(()=>{this.house=payload.value==='empty'?H.HouseModel.empty():H.HouseModel.defaultHouse();},'New draft ready. An empty house starts at grid (0, 0).');this.clearPlacement();s.selected=null;this.ui.closeModal();this.scene?.controls.frame(this.house);this.render();break;
          case 'undo':case 'redo':{
            const from=action==='undo'?this.undoStack:this.redoStack,to=action==='undo'?this.redoStack:this.undoStack;if(!from.length)return;
            const previous=this.house.animal;to.push(H.clone(this.house));this.house=from.pop();
            this.house.animal.absentSince=this.house.animal.placed?null:previous.placed?Date.now():previous.absentSince??Date.now();
            this.dirty=true;this.state.selected=null;this.refresh();this.repository.draft(this.house);this.ui.message(action==='undo'?'Change undone.':'Change restored.');break;
          }

        }
      }catch(error){
        if(this.ui.modal.open)this.ui.modalError(error.message);else this.ui.message(error.message,true);
      }
    }
    destroy({persist=true}={}){
      this.disposed=true;cancelAnimationFrame(this.frame);clearInterval(this.lifeTimer);this.events.abort();
      if(persist)this.persistRuntime();
      this.sound.destroy();
      this.tasks.destroy();
      this.scene?.destroy();this.ui.destroy();
    }
  }
  H.HouseEditor=HouseEditor;
  H.mount=(root,options)=>new HouseEditor(root,options);
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
