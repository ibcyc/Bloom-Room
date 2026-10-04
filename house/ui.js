/* DOM-only presentation. Change markup/styles here; every action goes through controller.dispatch(). */
(function(H){
  'use strict';
  const E=H.escape;
  const button=(action,label,extra='')=>'<button type="button" data-h-action="'+action+'" '+extra+'>'+label+'</button>';
  const options=(values,selected)=>values.map(([v,label])=>'<option value="'+E(v)+'"'+(v===selected?' selected':'')+'>'+E(label)+'</option>').join('');
  class HouseUI {
    constructor(root,controller){
      this.root=root;this.controller=controller;this.events=new AbortController();this.modal=root.querySelector('#house-dialog');this.toolbar=root.querySelector('#house-editor-ui');this.lastFocus=null;
      const opts={signal:this.events.signal};
      root.addEventListener('click',e=>{
        const b=e.target.closest('[data-h-action]');if(!b||b.disabled)return;e.preventDefault();
        if(b.dataset.hAction==='close-art'){this.closeArt();return;}
        if(b.dataset.hAction==='close-dialog'){if(controller.interactions.restockItem)controller.interactions.fridge();else this.closeModal();return;}
        if(b.matches('[data-h-type-trigger]')){
          this.flyout(b.closest('.house-hover-menu'),true);return;
        }
        controller.dispatch(b.dataset.hAction,{id:b.dataset.id,value:b.dataset.value,key:b.dataset.key});
      },opts);
      root.addEventListener('change',e=>{
        if(e.target.matches('[data-pip-mute]'))controller.dispatch('pip-mute',{value:e.target.checked});
        if(e.target.matches('[data-h-light-mode]'))controller.dispatch('light-mode',{value:e.target.checked});
        if(e.target.matches('[data-h-light-range]'))controller.dispatch('light-level',{value:e.target.value});
        if(e.target.matches('[data-h-weather]'))controller.dispatch('weather',{value:e.target.value});
        if(e.target.matches('[data-h-music-setting]'))controller.dispatch('music-setting',{key:e.target.dataset.hMusicSetting,value:e.target.value});
        if(e.target.matches('[data-music-seek]'))controller.sound.seek(Number(e.target.value)/1000);
        if(e.target.matches('[data-h-setting]'))controller.dispatch('setting',{key:e.target.dataset.hSetting,value:e.target.value});
        if(e.target.id==='house-art-file'&&e.target.files?.[0]){
          const input=e.target;input.disabled=true;controller.dispatch('upload-art',{file:input.files[0]}).finally(()=>{input.disabled=false;input.value='';});
        }
        if(e.target.id==='house-audio-files'&&e.target.files?.length){
          const input=e.target;input.disabled=true;controller.dispatch('upload-audio',{files:[...input.files]}).finally(()=>{input.disabled=false;input.value='';});
        }
        if(e.target.id==='house-import-file'){
          const file=e.target.files?.[0];if(!file)return;
          if(file.size>H.ImportExportSystem.MAX_SIZE){this.modalError('Choose a JSON file smaller than 80 MB.');return;}
          file.text().then(text=>controller.dispatch('preview-import',{text})).catch(()=>this.modalError('This file could not be read.'));
        }
      },opts);
      root.addEventListener('input',e=>{
        if(e.target.matches('[data-booking-start]'))e.target.dataset.edited='true';
        if(e.target.matches('[data-pip-volume]'))controller.dispatch('pip-volume',{value:e.target.value});
        if(e.target.matches('[data-h-light-range]'))controller.interactions.previewLight(e.target.value);
        if(e.target.matches('[data-h-music-setting="volume"]'))controller.sound.audio.volume=Number(e.target.value)/100;
      },opts);
      root.addEventListener('submit',e=>{
        const form=e.target;if(!form.dataset.hForm)return;e.preventDefault();e.stopPropagation();
        const values=new FormData(form);if(e.submitter?.name)values.set(e.submitter.name,e.submitter.value);
        controller.dispatch(form.dataset.hForm,Object.fromEntries(values));
      },opts);
      root.addEventListener('pointerover',e=>{
        const group=e.target.closest('.house-hover-menu');if(group&&e.pointerType!=='touch')this.flyout(group,true);
      },opts);
      root.addEventListener('pointerout',e=>{
        const group=e.target.closest('.house-hover-menu');
        if(group&&!group.contains(e.relatedTarget)&&!group.contains(document.activeElement))this.flyout(group,false);
      },opts);
      root.addEventListener('focusin',e=>{const group=e.target.closest('.house-hover-menu');if(group)this.flyout(group,true);},opts);
      root.addEventListener('focusout',e=>{
        const group=e.target.closest('.house-hover-menu');if(group&&!group.contains(e.relatedTarget)&&!group.matches(':hover'))this.flyout(group,false);
      },opts);
      root.addEventListener('keydown',e=>{
        const group=e.target.closest('.house-hover-menu');if(!group)return;
        if(e.key==='Escape'&&group.classList.contains('is-open')){
          e.preventDefault();e.stopPropagation();group.querySelector('[data-h-flyout-trigger]').focus();this.flyout(group,false);
        }else if(group.classList.contains('house-type-menu')&&['ArrowUp','ArrowDown'].includes(e.key)){
          e.preventDefault();this.flyout(group,true);
          const items=[...group.querySelectorAll('.house-type-options button')],index=items.indexOf(document.activeElement);
          const next=index<0?(e.key==='ArrowUp'?items.length-1:0):(index+(e.key==='ArrowUp'?-1:1)+items.length)%items.length;
          items[next].focus();
        }
      },opts);
      root.addEventListener('pointerdown',e=>{
        if(!e.target.closest('#house-pet-panel, [data-h-action="pet-status"]'))this.petOpen(false);
        if(!e.target.closest('.house-texture-panel, [data-h-action="texture"]'))this.closeTexture();
        for(const group of this.toolbar.querySelectorAll('.house-hover-menu'))if(!group.contains(e.target))this.flyout(group,false);
      },opts);
      this.modal.addEventListener('cancel',e=>{if(controller.interactions.restockItem){e.preventDefault();controller.interactions.fridge();}},opts);
      this.modal.addEventListener('close',()=>{controller.lightPreview=null;controller.applyLighting();if(controller.state.editing&&controller.state.tool==='PLACE')controller.scene?.canvas.focus({preventScroll:true});else if(this.lastFocus?.isConnected)this.lastFocus.focus();},opts);
    }
    closeTexture(){
      this.controller.state.textureOpen=false;this.toolbar.querySelector('.house-texture-panel')?.remove();
      const trigger=this.toolbar.querySelector('[data-h-action="texture"]');
      if(trigger){trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');}
    }
    flyout(group,open){
      if(open&&group.classList.contains('house-type-menu'))this.closeTexture();
      if(group.classList.contains('house-save-menu')&&matchMedia('(hover: none), (pointer: coarse)').matches)open=true;
      group.classList.toggle('is-open',open);group.querySelector('[data-h-flyout-trigger]').setAttribute('aria-expanded',String(open));
    }
    render(state,h,dirty){
      const oldSave=this.toolbar.querySelector('.house-save-menu');
      const saveOpen=!!oldSave?.classList.contains('is-open')&&(oldSave.matches(':hover')||oldSave.contains(document.activeElement));
      this.root.classList.toggle('is-editing',state.editing);document.body.classList.toggle('house-editing',state.editing);
      for(const button of this.root.querySelectorAll('[data-h-action="member"]')){
        const count=(h.social?.requests||[]).filter(r=>r.recipients.some(w=>w.memberId===button.dataset.id&&w.response==='pending')).length;
        let badge=button.querySelector('.house-inbox-count');if(!badge){badge=document.createElement('span');badge.className='house-inbox-count';button.append(badge);}badge.textContent=String(count);badge.hidden=!count;
      }
      if(state.editing)this.petOpen(false);
      if(!state.editing){this.toolbar.innerHTML='';return;}
      const selected=state.selected,heights=[['1','1 m'],['1.5','1.5 m'],['2','2 m']];
      let inspector='';
      if(selected){
        const object=selected.kind==='object'?h.objects.find(o=>o.id===selected.id):null;
        inspector='<div class="house-inspector"><small>R · rotate / M · move</small><span class="house-selection-label">Selected: '+E(object?H.Catalog[object.objectType].name:selected.kind==='animal'?'Pip · Cat':selected.kind)+'</span>'+
          (object?.placement==='WALL'?'<label>Height <select aria-label="Selected object height" data-h-setting="objectHeight">'+options(heights,String(object.height))+'</select></label>':'')+'</div>';
      }
      const typeOptions=[['wall','Wall'],['door','Door'],['floor','Floor']];
      const activeType=state.tool==='PLACE'?(state.layer==='STRUCTURE'?typeOptions.find(([id])=>id===state.build)?.[1]:H.Catalog[state.furniture]?.name):null;
      const typeLabel=activeType?'Type: '+E(activeType):'Type';
      const texture=state.textureOpen?'<div class="house-texture-panel" id="house-texture-panel" role="group" aria-label="Texture settings"><span>Preset</span><div class="house-texture-presets">'+
        Object.entries(H.Finishes).map(([id,item])=>button('setting',E(item.name),'data-key="finish" data-value="'+id+'" aria-pressed="'+(state.finish===id)+'"')).join('')+
        '</div><label>Color <input type="color" aria-label="Texture color" data-h-setting="color" value="'+E(state.color)+'"></label><small>Click or drag a structure to apply · Esc to select</small></div>':'';
      const tools=state.layer==='STRUCTURE'?'<div class="house-mode-tools" aria-label="Structure tools"><div class="house-hover-menu house-type-menu">'+
        button('type-menu',typeLabel,'data-h-type-trigger data-h-flyout-trigger aria-expanded="false" aria-controls="house-type-options" aria-pressed="'+(state.tool==='PLACE')+'" title="Choose a type to build"')+
        '<div id="house-type-options" class="house-type-options house-flyout" role="group" aria-label="Structure type">'+typeOptions.map(([id,label])=>button('setting',label,'data-key="build" data-value="'+id+'" aria-pressed="'+(state.build===id)+'"')).join('')+'</div></div>'+
        button('texture','Texture','aria-expanded="'+state.textureOpen+'"'+(state.textureOpen?' aria-controls="house-texture-panel"':'')+' aria-pressed="'+(state.tool==='MATERIAL')+'"')+texture+'</div>':
        '<div class="house-mode-tools" aria-label="Object tools">'+button('catalog','＋','title="Add object" aria-label="Add object" aria-pressed="'+(state.tool==='PLACE')+'"')+'</div>';
      const mount=state.layer==='OBJECT'&&state.tool==='PLACE'&&H.Catalog[state.furniture]?.placement==='WALL'?'<label class="house-mount-height">Height <select aria-label="Mount height" data-h-setting="height">'+options(heights,String(state.height))+'</select></label>':'';
      this.toolbar.innerHTML='<nav class="house-edit-dock" aria-label="House editor tools">'+inspector+mount+tools+
        '<div class="house-layer-row"><div class="house-layer-switch" role="group" aria-label="Editor layer">'+[['OBJECT','Object'],['STRUCTURE','Structure']].map(([id,label])=>button('setting',label,'data-key="layer" data-value="'+id+'" aria-pressed="'+(state.layer===id)+'"')).join('')+'</div>'+button('new-house','! Reset','class="house-reset"')+'</div>'+
        '<div class="house-hover-menu house-save-menu">'+button('export','Export','class="house-save-export house-flyout"')+button('save','SAVE','class="house-primary" data-h-flyout-trigger aria-expanded="false" title="Save your house"')+button('import','Import','class="house-save-import house-flyout"')+'</div></nav>';
      this.flyout(this.toolbar.querySelector('.house-save-menu'),saveOpen);
    }
    message(text,error=false){
      const el=this.root.querySelector('#house-message');el.textContent=text;el.classList.toggle('is-error',error);
      el.classList.add('is-visible');clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>el.classList.remove('is-visible'),5000);
    }
    hint(text){this.root.querySelector('#house-hover-hint').textContent=text||'';}
    closeArt(){const popup=this.root.querySelector('.house-art-preview');if(!popup)return;const restore=popup.contains(document.activeElement);popup.remove();if(restore)this.controller.scene?.canvas.focus({preventScroll:true});}
    showArt(image){
      this.closeArt();const popup=document.createElement('div');popup.className='house-art-preview';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Framed picture');
      popup.innerHTML=button('close-art','×','aria-label="Close picture"');const img=document.createElement('img');img.src=image;img.alt='Framed picture';popup.append(img);this.root.append(popup);popup.querySelector('button').focus({preventScroll:true});
    }
    petOpen(open){
      const panel=this.root.querySelector('#house-pet-panel');if(!panel)return;
      panel.hidden=!open;this.root.querySelector('[data-h-action="pet-status"]').setAttribute('aria-expanded',String(open));
    }
    animal(status){
      const panel=this.root.querySelector('#house-pet-panel');if(!panel)return;
      const mute=panel.querySelector('[data-pip-mute]');if(mute)mute.checked=!!this.controller.tasks?.muted;
      const volume=panel.querySelector('[data-pip-volume]'),test=panel.querySelector('[data-h-action="pip-preview"]');if(volume){volume.value=Math.round((this.controller.tasks?.meowVolume??.7)*100);volume.disabled=!!this.controller.tasks?.muted;panel.querySelector('[data-pip-volume-label]').textContent=volume.value+'%';}if(test)test.disabled=!!this.controller.tasks?.muted||!status.placed;
      panel.querySelector('[data-pet-absent]').hidden=status.placed;
      panel.querySelector('[data-pet-vitals]').hidden=!status.placed;
      panel.querySelector('[data-pet-hunger]').textContent=status.hunger;
      panel.querySelector('[data-pet-health]').textContent=status.health+' / 100';
      panel.querySelector('progress').value=status.health;
      const countdown=panel.querySelector('[data-pet-countdown]');countdown.hidden=!status.placed||status.hunger!=='horrible';
      const seconds=Math.ceil(status.remaining/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
      countdown.textContent='Feed within '+[hours,minutes,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
      this.root.querySelector('.house-pet-alert').hidden=!status.placed||status.hunger!=='horrible';
      this.root.querySelector('.house-cat-avatar').classList.toggle('is-absent',!status.placed);
      const catChoice=this.modal.querySelector('[data-h-action="choose-object"][data-id="cat"]');if(catChoice)catChoice.disabled=status.placed;
    }
    dialog(title,body){
      this.lastFocus=document.activeElement;
      this.modal.innerHTML='<div class="house-dialog-title"><h2 id="house-dialog-title">'+E(title)+'</h2>'+button('close-dialog','×','aria-label="Close house dialog"')+'</div>'+body+'<p id="house-modal-error" class="form-error" role="alert"></p>';
      if(!this.modal.open)this.modal.showModal();
    }
    closeModal(){this.modal.close();}
    modalError(message){const el=this.modal.querySelector('#house-modal-error');if(el)el.textContent=message;else this.message(message,true);}
    modelSetup(){
      this.dialog('Import a custom model','<form data-h-form="model-import" class="house-interaction-form"><label>Model<input type="file" name="file" accept=".glb,model/gltf-binary" required></label><p class="help">Static GLB · up to 10 MB · embed textures in the file. Models keep their proportions within the selected size.</p><div class="house-inline-fields"><label>Width (cells)<input name="width" type="number" min="1" max="20" step="1" value="1" required></label><label>Depth (cells)<input name="depth" type="number" min="1" max="20" step="1" value="1" required></label><label>Height (max. 3 cells)<input name="height" type="number" min="0.1" max="3" step="0.1" value="1" required></label></div><button type="submit">Import &amp; place</button></form>');
    }
    catalog(h){
      const cards=Object.entries(H.Catalog).map(([id,item])=>{
        const full=id==='cat'&&h.animal.placed,thumbnail=id!=='custom'&&this.controller.scene?.catalogThumbnail(id);
        return '<button data-h-action="choose-object" data-id="'+id+'"'+(full?' disabled aria-disabled="true"':'')+'>'+(thumbnail?'<img class="house-object-thumbnail" src="'+thumbnail+'" alt="">':'<span class="house-object-thumbnail house-upload-icon" aria-hidden="true">⇧</span>')+'<strong>'+E(item.name)+'</strong><small>'+ (full?'Already placed · 1 / 1':id==='cat'?'One cat per house':item.placement==='WALL'?'Wall mounted':item.tabletop?'Floor or tabletop':id==='custom'?'Upload .glb · up to 3 cells high':id==='longtable'?'2 × 1 · eight tabletop positions':id==='table'?'Four tabletop positions':'Floor · '+item.size.x+' × '+item.size.z+' cell')+'</small></button>';
      });
      this.dialog('Make a little room.','<p>Choose an item and click to place it once. Esc or right-click cancels the preview. Green means it fits; red explains what to change.</p><div class="house-catalog">'+cards.join('')+'</div>');
    }
    help(){
      this.dialog('A small guide to your house.','<div class="house-help"><p><strong>Build:</strong> Switch to Structure. Open Type and choose Wall, Door, or Floor for each build stroke. Releasing after a successful stroke returns to selection. Hold the left button and drag to build; hold the right button and drag to remove. Each stroke is one undo. Floors share an edge; start an empty house at (0, 0). R rotates the preview: walls and doors switch between the two rear edges; floors rotate their grain. Doors need a supporting wall in that direction and remain closed.</p><p><strong>Place:</strong> Object → ＋. Click to place one item, then choose again. Pip automatically visits reachable food bowls and removes each bowl after eating. Esc or right-click cancels a preview; right-click a placed item to delete it. Unsupported or overlapping items are removed. Pip can be placed once; delete him to place him again. After ten minutes without a cat, a reminder stays until Pip is placed. Custom static GLB models can be imported from ＋, sized up to three cells high, moved/rotated and included in exports. Tables have four positions for Sprout or Speaker; long tables have eight. Removing a table also removes the objects on it. Food bowls stay on the floor.</p><p><strong>Objects:</strong> In the room, click Refrigerator to manage chilled/frozen items and create restocking tasks when an item runs out; Trash can or Vacuum cleaner for rotations, Washer &amp; dryer or Oven for reservations (any whole number of minutes), Window for sunny/rainy/snowy skies, light or local time, Speaker for music, Message board for tasks, or the door for local roommate requests. Roommate avatars open local inboxes. Choose a picture when placing Wall art, or click an empty frame to upload once; later clicks open it until you close the picture.</p><p><strong>Your tasks:</strong> The left cards show only your tasks, soonest first. Click for details, then use the completion button to finish your part. Appliance turn and finish reminders appear 30 minutes ahead. Due cards turn red and ring once; Pip occasionally reminds you about the first card. A browser may wait for your first click before allowing sound.</p><p><strong>Pip:</strong> Click the cat avatar to see hunger and health or adjust the meow volume and mute it. Hunger changes every six hours: full, ok, hungry, then horrible with a countdown. After 24 hours without eating Pip is removed. Time continues while the site is closed. Click a sofa or bed to send Pip onto it.</p><p><strong>Arrangement &amp; Sprout:</strong> The calendar combines tasks, bills, rotations, bookings, requests and Pip’s feeding deadline. Click Sprout for chore points and its complete history. Completion earns +1; each task left more than three hours overdue loses 1, once per assignee. Plants start at 100, stop at 0 and must then be replaced.</p><p><strong>Paint:</strong> Structure → Texture. Choose a preset and color. Drag the left button to paint; drag the right button to restore defaults.</p><p><strong>Select:</strong> Click an item when no placement or texture tool is active; Esc returns to selection. Blue marks the selection. Click outside the house to clear it. R rotates selected objects or a placement preview. M moves a selected object while keeping its picture and settings. Editing disables furniture interactions; Pip still walks to newly placed food.</p><p><strong>Camera:</strong> Drag outside the house with either mouse button or one finger to pan. A valid build cell starts a build stroke. Middle-button drag also pans. Scroll or pinch to zoom. Reset angle centers and fits the house to your screen.</p><p><strong>History:</strong> Ctrl+Z undoes; Ctrl+Shift+Z redoes. On Mac, Cmd works too.</p><p><strong>Menus:</strong> Object / Structure and Texture choices are remembered in this browser. Type starts empty and clears after placement, cancellation or a layer change. Hover SAVE to reveal Export / Import without moving SAVE. On touch screens Export / Import stay available and Type opens by tapping.</p><p><strong>Save:</strong> SAVE stores this room in this browser and finishes editing. Export JSON makes a portable house preset; Import validates it before replacing your draft. Reset offers an empty or default house. Unsaved drafts are recovered locally.</p></div>');
    }
    destroy(){clearTimeout(this.messageTimer);clearTimeout(this.artTimer);this.events.abort();if(this.modal.open)this.modal.close();document.body.classList.remove('house-editing');}
  }
  H.HouseUI=HouseUI;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
