(function(H){
  'use strict';
  class EditorPreferences {
    static key='roombloom-editor-preferences-v1';
    static clean(value={}){
      const source=value&&typeof value==='object'?value:{};
      return {
        layer:['OBJECT','STRUCTURE'].includes(source.layer)?source.layer:'STRUCTURE',
        buildRotation:[0,90,180,270].includes(source.buildRotation)?source.buildRotation:0,
        height:[1,1.5,2].includes(source.height)?source.height:1.5,
        finish:Object.hasOwn(H.Finishes,source.finish)?source.finish:'wood',
        color:typeof source.color==='string'&&/^#[0-9a-f]{6}$/i.test(source.color)?source.color:'#c6a276'
      };
    }
    static load(){try{return this.clean(JSON.parse(localStorage.getItem(this.key)||'null'));}catch(_){return this.clean();}}
    static save(state){try{localStorage.setItem(this.key,JSON.stringify(this.clean(state)));return true;}catch(_){return false;}}
  }
  class SaveSystem {
    constructor(roomId){this.key='roombloom-house-v1:'+roomId;this.baseline=null;}
    load(){
      let saved=H.HouseModel.defaultHouse(),draft=null,notice='';
      try{
        const raw=localStorage.getItem(this.key);
        if(raw){saved=H.HouseModel.validate(JSON.parse(raw));this.baseline=saved.metadata.savedAt;}
        const pending=localStorage.getItem(this.key+':draft');
        if(pending){draft=H.HouseModel.validate(JSON.parse(pending));notice='Your unsaved draft was restored. Save it when you’re ready.';}
      }catch(error){notice='A stored house could not be read. The default house is ready; import a backup to recover it.';}
      return {house:draft||H.clone(saved),saved,dirty:!!draft,notice};
    }
    save(h){
      const data=H.HouseModel.validate(h);
      try{
        const previous=localStorage.getItem(this.key);
        if(previous&&JSON.parse(previous).metadata.savedAt!==this.baseline)throw new Error('Another tab saved this room. Export your draft before reloading.');
        data.metadata.savedAt=new Date().toISOString();localStorage.setItem(this.key,JSON.stringify(data));localStorage.removeItem(this.key+':draft');this.baseline=data.metadata.savedAt;
      }catch(error){throw new Error(error.message.includes('Another tab')?error.message:'The browser could not save this house. Export a JSON backup instead.');}
      return data;
    }
    draft(h){try{localStorage.setItem(this.key+':draft',JSON.stringify(h));return true;}catch(_){return false;}}
    discardDraft(){try{localStorage.removeItem(this.key+':draft');}catch(_){}}
  }
  class ImportExportSystem {
    static MAX_SIZE=80*1024*1024;
    static parse(text){
      if(typeof text!=='string'||text.length>this.MAX_SIZE)throw new Error('Choose a JSON file smaller than 80 MB.');
      let input;try{input=JSON.parse(text);}catch(_){throw new Error('This is not valid JSON. Choose a Bloom Room house export.');}
      const h=H.HouseModel.validate(input);
      for(const o of h.objects)for(const track of o.customState.music?.tracks||[])if(!h.assets?.[track.id])throw new Error('This export is missing its audio files.');
      for(const o of h.objects)if(o.objectType==='custom'&&!h.assets?.[o.customState.model.id])throw new Error('This export is missing its custom models.');
      return h;
    }
    static serialize(h){const text=JSON.stringify(H.HouseModel.validate(h),null,2);if(new Blob([text]).size>this.MAX_SIZE)throw new Error('This export exceeds 80 MB. Remove some custom audio or models before exporting.');return text;}
    static download(h){
      const url=URL.createObjectURL(new Blob([this.serialize(h)],{type:'application/json'})),a=document.createElement('a');
      a.href=url;a.download='roombloom-house.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  // Reset runtime data only. Never clear the origin's entire storage or touch bundled assets.
  class DemoReset {
    static signalKey='roombloom-demo-reset-v1';
    static owns(key){
      return ['roombloom-demo-v1','roombloom-mood-v1','roombloom-editor-preferences-v1'].includes(key)||
        ['roombloom-house-v1:','roombloom-task-alerts-v1:','roombloom-autoplay-v1:','roombloom-pip-mute-v1:','roombloom-pip-volume-v1:'].some(prefix=>key.startsWith(prefix));
    }
    static async clear(){
      const keys=Object.keys(localStorage).filter(key=>this.owns(key));
      await H.MediaStore.clear();
      for(const key of new Set([...keys,...Object.keys(localStorage).filter(key=>this.owns(key))]))localStorage.removeItem(key);
      sessionStorage.removeItem('roombloom-intro-seen');
      // Other open RoomBloom tabs must stop their old runtime without saving it again.
      localStorage.setItem(this.signalKey,Date.now()+':'+Math.random().toString(36).slice(2));
    }
  }
  Object.assign(H,{EditorPreferences,SaveSystem,ImportExportSystem,DemoReset});
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
