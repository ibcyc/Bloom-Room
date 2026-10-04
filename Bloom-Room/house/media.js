/* Uploads stay in this browser. Audio blobs use IndexedDB, with portable JSON bundling. */
(function(H){
 'use strict';
 const MIME=['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/webm','audio/flac'];
 class MediaStore {
  static db(){
   return this.pending||=(new Promise((resolve,reject)=>{
    const request=indexedDB.open('roombloom-media-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{this.pending=null;reject(new Error('This browser could not open media storage.'));};
   }));
  }
  static async put(id,blob){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(blob,id);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('This browser could not save the media file.'));tx.onabort=tx.onerror;});}
  static async get(id){const db=await this.db();return new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Media storage could not be read.'));});}
  static async clear(){
   const db=await this.db();
   return new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new Error('Uploaded demo files could not be cleared. Please try again.'));
   });
  }
  static dataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('The file could not be read.'));r.readAsDataURL(blob);});}
  static async picture(file){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
   let bitmap;try{bitmap=await createImageBitmap(file);}catch(_){throw new Error('This image could not be opened.');}
   try{
    if(bitmap.width>12000||bitmap.height>12000)throw new Error('Choose an image smaller than 12,000 pixels per side.');
    const ratio=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.65,.45]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=250000)return data;}
    throw new Error('Choose a smaller image.');
   }finally{bitmap.close();}
  }
  static async audio(file){
   const mime=file.type||({'mp3':'audio/mpeg','wav':'audio/wav','ogg':'audio/ogg','m4a':'audio/mp4','webm':'audio/webm','flac':'audio/flac'}[file.name.split('.').pop().toLowerCase()]);
   if(!MIME.includes(mime)||file.size<1||file.size>10*1024*1024)throw new Error('Choose supported audio up to 10 MB per track.');
   const url=URL.createObjectURL(file),audio=new Audio();
   let duration;try{duration=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Audio loading timed out.')),15000);audio.onloadedmetadata=()=>{clearTimeout(timer);resolve(audio.duration);};audio.onerror=()=>{clearTimeout(timer);reject(new Error('This browser cannot play that audio format.'));};audio.preload='metadata';audio.src=url;});}finally{audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
   if(!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error('Choose a track up to one hour long.');
   const track={id:H.uid('audio'),name:file.name.slice(0,80)||'Audio',mime,duration,bytes:file.size};await this.put(track.id,new Blob([file],{type:mime}));return track;
  }
  static async pack(h){
   const packed=H.HouseModel.validate(h),assets={};
   for(const o of packed.objects)for(const track of o.customState.music?.tracks||[]){
    if(assets[track.id])continue;const blob=await this.get(track.id);if(!blob)throw new Error('A custom audio file is missing from this browser. Remove it from the playlist before exporting.');
    assets[track.id]={mime:track.mime,data:(await this.dataURL(blob)).split(',')[1]};
   }
   for(const o of packed.objects.filter(o=>o.objectType==='custom')){
    const model=o.customState.model;if(assets[model.id])continue;const blob=await this.get(model.id);if(!blob)throw new Error('A custom model is missing from this browser. Import its original export to restore it.');
    assets[model.id]={mime:'model/gltf-binary',data:(await this.dataURL(blob)).split(',')[1]};
   }
   if(Object.keys(assets).length)packed.assets=assets;return packed;
  }
  static async hydrate(input){
   const h=H.HouseModel.validate(input),mapping=new Map();
   for(const o of h.objects)for(const track of o.customState.music?.tracks||[]){
    const asset=h.assets?.[track.id];if(!asset)throw new Error('This export is missing its audio files.');
    if(!mapping.has(track.id)){const binary=atob(asset.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(bytes.length!==track.bytes||asset.mime!==track.mime)throw new Error('An audio file does not match its playlist entry.');const id=H.uid('audio');await this.put(id,new Blob([bytes],{type:asset.mime}));mapping.set(track.id,id);}
    track.id=mapping.get(track.id);
   }
   for(const o of h.objects.filter(o=>o.objectType==='custom')){
    const model=o.customState.model,asset=h.assets?.[model.id];if(!asset)throw new Error('This export is missing a custom model.');
    if(!mapping.has(model.id)){const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));if(bytes.length!==model.bytes||asset.mime!=='model/gltf-binary')throw new Error('A model does not match its object.');
     const imported=await H.CustomModels.upload(new File([bytes],model.name.toLowerCase().endsWith('.glb')?model.name:model.name+'.glb',{type:asset.mime}));mapping.set(model.id,imported.id);}
    model.id=mapping.get(model.id);
   }
   delete h.assets;return h;
  }
 }
 const DefaultTracks=[
  {id:'preset-first-snow',name:'First Snow',artist:'HoliznaCC0',url:'house/audio/first-snow.mp3'},
  {id:'preset-laundry',name:'Laundry On The Wire',artist:'HoliznaCC0',url:'house/audio/laundry-on-the-wire.mp3'},
  {id:'preset-keeping-cool',name:'Keeping Cool',artist:'HoliznaCC0',url:'house/audio/keeping-cool.mp3'}
 ];
 class SoundSystem {
  constructor(house,onchange,roomId){
   this.house=house;this.onchange=onchange;this.audio=new Audio();this.audio.preload='metadata';this.objectId=null;this.index=0;this.token=0;this.needsAuto=true;
   this.preferenceKey='roombloom-autoplay-v1:'+roomId;try{this.autoplayEnabled=localStorage.getItem(this.preferenceKey)!=='off';}catch(_){this.autoplayEnabled=true;}
   this.audio.addEventListener('ended',()=>{const o=this.object();if(!o)return;const mode=this.settings(o).loop;if(mode==='track')this.play(this.objectId,this.index).catch(e=>this.error(e));else if(this.index<this.tracks(o).length-1||mode==='playlist')this.play(this.objectId,(this.index+1)%this.tracks(o).length).catch(e=>this.error(e));else this.onchange();});
   for(const event of ['play','pause','timeupdate','loadedmetadata'])this.audio.addEventListener(event,()=>this.onchange());
   this.audio.addEventListener('error',()=>{if(!this.audio.getAttribute('src'))return;this.lastError='This song could not be played. Choose another song.';this.onchange();});
  }
  settings(o){return o.customState.music||{tracks:[],loop:'playlist',volume:.25,enabled:true};}
  object(){return this.house().objects.find(o=>o.id===this.objectId&&o.objectType==='speaker');}
  tracks(o){return [...DefaultTracks,...this.settings(o).tracks];}
  setEnabled(enabled){this.autoplayEnabled=enabled;this.needsAuto=enabled;try{localStorage.setItem(this.preferenceKey,enabled?'on':'off');}catch(_){}if(!enabled)this.audio.pause();}
  async autoStart(){
   if(this.disposed||!this.autoplayEnabled||!this.needsAuto||this.autoAttempt)return;
   const o=this.object()||this.house().objects.find(o=>o.objectType==='speaker'&&this.settings(o).enabled!==false);if(!o)return;
   this.autoAttempt=true;try{await this.play(o.id,this.objectId===o.id?this.index:0,true);}catch(e){this.error(e);}finally{this.autoAttempt=false;}
  }
  async play(id,index=0,automatic=false){
   const o=this.house().objects.find(o=>o.id===id&&o.objectType==='speaker');if(!o)throw new Error('This speaker is no longer in the room.');
   const track=this.tracks(o)[index];if(!track)throw new Error('Choose a song.');
   const token=++this.token;this.audio.pause();this.objectId=id;this.index=index;this.trackId=track.id;this.lastError='';this.needsAuto=false;this.loading=true;this.onchange();
   let url=track.url;if(!url){
    try{const blob=await MediaStore.get(track.id);if(token!==this.token)return;if(!blob)throw new Error('This custom song is missing. Upload it again.');url=URL.createObjectURL(blob);}
    catch(error){if(token===this.token){this.loading=false;this.onchange();}throw error;}
   }
   if(this.blobURL)URL.revokeObjectURL(this.blobURL);this.blobURL=track.url?null:url;this.audio.src=url;this.audio.volume=this.settings(o).volume;
   try{await this.audio.play();if(token===this.token){this.loading=false;this.gestureNeeded=false;this.onchange();}}
   catch(error){if(token!==this.token)return;this.loading=false;if(automatic&&error.name==='NotAllowedError'){this.gestureNeeded=true;this.needsAuto=true;this.onchange();return;}this.onchange();throw new Error('Playback could not start. Press Play or choose another song.');}
  }
  async toggle(id){
   if(this.objectId===id&&!this.audio.paused){this.setEnabled(false);this.onchange();return false;}
   this.setEnabled(true);this.needsAuto=false;this.lastError='';
   if(this.objectId===id&&this.audio.getAttribute('src')&&!this.audio.ended){await this.audio.play();this.gestureNeeded=false;this.onchange();}else await this.play(id);
   return true;
  }
  seek(fraction){if(Number.isFinite(this.audio.duration))this.audio.currentTime=Math.max(0,Math.min(1,fraction))*this.audio.duration;}
  error(e){this.loading=false;this.lastError=e.message;this.onchange();}
  sync(){
   if(!this.objectId){this.needsAuto=true;this.autoStart();return;}
   const o=this.object();if(!o||!this.tracks(o).some(t=>t.id===this.trackId)){this.stop();this.needsAuto=true;this.autoStart();return;}
   this.index=this.tracks(o).findIndex(t=>t.id===this.trackId);this.audio.volume=this.settings(o).volume;
  }
  stop(){++this.token;this.loading=false;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();if(this.blobURL)URL.revokeObjectURL(this.blobURL);this.blobURL=null;this.objectId=null;}
  destroy(){this.disposed=true;this.onchange=()=>{};this.stop();}
 }
 Object.assign(H,{MediaStore,SoundSystem,DefaultTracks});
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
