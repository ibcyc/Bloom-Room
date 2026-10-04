/* The editor, runtime, JSON exports and future presets all use this same versioned format. */
(function(H){
  'use strict';
  const G=H.GridSystem;
  class HouseModel {
    static empty(){
      return {format:'RoomBloomHouse',version:1,structure:{floors:[],walls:[],doors:[]},objects:[],materials:{},
        animal:{id:'pip',name:'Pip',placed:false,absentSince:Date.now(),grid:{x:0,y:0,z:0},lifeId:H.uid('cat'),lastFedAt:Date.now(),health:100},lighting:{mode:'auto',level:1},weather:H.HouseFeatures.newWeather(),social:{isPublic:false,requests:[]},metadata:{name:'RoomBloom house',savedAt:null}};
    }
    static defaultHouse(now=Date.now()){
      const h=H.clone(H.DefaultHousePreset);
      h.metadata.savedAt=null;h.social.requests=[];
      Object.assign(h.animal,{absentSince:h.animal.placed?null:now,lifeId:H.uid('cat'),lastFedAt:now,health:100});
      for(const o of h.objects){
        if(o.customState.machines)o.customState.machines=Object.fromEntries(H.HouseFeatures.machineKeys(o).map(key=>[key,[]]));
        if(o.objectType==='plant')o.customState.growth={placedAt:now,score:100,deadAt:null,history:[]};
      }
      return this.validate(h);
    }
    // Legacy small-house fixture remains available for geometry examples/tests.
    static basic(){
      const h=this.empty();
      for(let x=0;x<6;x++) for(let z=0;z<5;z++) h.structure.floors.push({id:'floor-'+x+'-'+z,grid:{x,y:0,z}});
      for(let x=0;x<6;x++) h.structure.walls.push({id:'wall-n-'+x,grid:{x,y:0,z:0},side:'N'});
      for(let z=0;z<5;z++) h.structure.walls.push({id:'wall-w-'+z,grid:{x:0,y:0,z},side:'W'});
      h.structure.doors.push({id:'door-entry',wallId:'wall-n-3',locked:true});
      for(const [type,x,z] of [['sofa',1,1],['bed',4,1],['table',3,3],['trash',5,3],['bowl',1,3],['plant',0,3]]) h.objects.push(H.objectDefinition(type,{x,z},{id:'object-'+type}));
      const window=H.objectDefinition('window',{x:1,z:0},{id:'object-window',wallId:'wall-n-1',height:1.5});window.grid.y=3;h.objects.push(window);
      h.animal.placed=true;h.animal.absentSince=null;h.animal.grid={x:2,y:0,z:2};
      return h;
    }
    static validate(input){
      const fail=message=>{throw new Error(message);};
      if(!input||typeof input!=='object'||Array.isArray(input)||input.format!=='RoomBloomHouse'||input.version!==1) fail('Use a RoomBloomHouse JSON file with version 1.');
      const h=H.clone(input), s=h.structure;
      if(!s||!['floors','walls','doors'].every(k=>Array.isArray(s[k]))||!Array.isArray(h.objects)||!h.materials||Array.isArray(h.materials)) fail('The house is missing structure, objects, or materials.');
      if(s.floors.length>400||s.walls.length>800||s.doors.length>800||h.objects.length>200) fail('This house exceeds the editor limits (400 floor cells, 200 placed objects).');
      // Older version-1 houses may contain retired inventory; placed furniture is preserved.
      delete h.storage;
      const ids=new Set(['pip']), floorKeys=new Set(),wallKeys=new Set(),wallIds=new Set();
      const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value)||value in Object.prototype||ids.has(value))fail('Every object needs a unique, valid ID.');ids.add(value);};
      const grid=(p,wall=false)=>{if(!p||!G.inside(p)||!Number.isInteger(p.y)||p.y<0||p.y>5||(!wall&&p.y!==0))fail('Grid positions must be valid integers inside X/Z -8 to 11.');};
      for(const f of s.floors){id(f.id);grid(f.grid);if(f.rotation!==undefined&&![0,90,180,270].includes(f.rotation))fail('Floor rotation must be 0, 90, 180 or 270 degrees.');const key=G.key(f.grid);if(floorKeys.has(key))fail('Two floors occupy the same cell.');floorKeys.add(key);}
      if(!G.connected(s.floors))fail('Floor cells must form one connected house.');
      for(const w of s.walls){id(w.id);grid(w.grid);if(!['N','W'].includes(w.side)||!floorKeys.has(G.key(w.grid)))fail('A wall must use a supported rear edge of a floor cell.');const key=G.edge(w.grid,w.side);if(wallKeys.has(key))fail('Two walls occupy the same edge.');wallKeys.add(key);wallIds.add(w.id);}
      const doors=new Set();
      for(const d of s.doors){id(d.id);if(!wallIds.has(d.wallId)||doors.has(d.wallId)||typeof d.locked!=='boolean')fail('Every door must attach to a unique wall and have a boolean locked state.');d.locked=true;doors.add(d.wallId);}
      const validateObject=o=>{
        if(!o||o.objectType==='cat'||!Object.hasOwn(H.Catalog,o.objectType))fail('The house contains an unknown furniture type.');
        const def=H.Catalog[o.objectType];
        if(o.objectType==='art'&&o.interactionType===null)o.interactionType='ART';
        if(o.objectType==='lamp'&&o.interactionType===null)o.interactionType='LAMP';
        if(o.objectType==='window'&&o.interactionType===null)o.interactionType='LIGHTING';
        id(o.id);grid(o.grid,def.placement==='WALL');
        if(o.placement!==def.placement||![0,90,180,270].includes(o.rotation))fail('Furniture placement type or rotation is invalid.');
        if(o.objectType==='custom' ? (!o.size||!['x','z'].every(k=>Number.isInteger(o.size[k])&&o.size[k]>=1&&o.size[k]<=20)||!Number.isFinite(o.size.y)||o.size.y<=0||o.size.y>3) : (!o.size||!['x','y','z'].every(k=>o.size[k]===def.size[k])))fail('Furniture size must match its catalog definition.');
        if(o.interactionType!==def.interactionType||!o.customState||Array.isArray(o.customState)||typeof o.customState!=='object')fail('Furniture interaction state is invalid.');
        const schedule=o.customState.schedule;
        if(schedule!==undefined){
          if(!schedule||typeof schedule!=='object'||!Array.isArray(schedule.order)||!schedule.order.length||schedule.order.length>4||new Set(schedule.order).size!==schedule.order.length||schedule.order.some(v=>typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v)))fail('Trash schedules need one to four distinct member IDs.');
          if(schedule.nextIndex!==undefined&&(!Number.isInteger(schedule.nextIndex)||schedule.nextIndex<0||schedule.nextIndex>=schedule.order.length))fail('Trash schedule turn index is invalid.');
          if(schedule.note!==undefined&&(typeof schedule.note!=='string'||schedule.note.length>160))fail('Trash schedule notes must be 160 characters or fewer.');
          if(schedule.frequency!==undefined&&!['daily','weekly'].includes(schedule.frequency))fail('Trash schedule frequency must be daily or weekly.');
        }
        if(!o.interactionConfig||!Array.isArray(o.interactionConfig.interactionPoints)||o.interactionConfig.interactionPoints.length>8||o.interactionConfig.interactionPoints.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.z)||Math.abs(p.x)+Math.abs(p.z)!==1))fail('Furniture interaction points must be adjacent grid offsets.');
        if(def.placement==='WALL'&&(![1,1.5,2].includes(o.height)||o.grid.y!==o.height/G.HEIGHT_STEP||!wallIds.has(o.attachedWallId)))fail('Wall furniture needs a supporting wall and a valid height.');
      };
      for(const o of h.objects)validateObject(o);
      H.HouseFeatures.validate(h);
      const structuralIds=new Set([...s.floors,...s.walls,...s.doors].map(o=>o.id));
      for(const [key,m] of Object.entries(h.materials))if(!structuralIds.has(key)||!m||!Object.hasOwn(H.Finishes,m.finish)||!/^#[0-9a-f]{6}$/i.test(m.color))fail('A material must refer to a structure and use a supported finish and hex color.');
      if(!h.animal||h.animal.id!=='pip'||typeof h.animal.name!=='string'||h.animal.name.length>32)fail('The house needs a valid animal definition.');
      grid(h.animal.grid);
      if(h.animal.placed===undefined)h.animal.placed=!!s.floors.some(f=>G.key(f.grid)===G.key(h.animal.grid));
      if(typeof h.animal.placed!=='boolean')fail('Animal placement must be a boolean.');
      if(h.animal.lifeId===undefined)h.animal.lifeId=H.uid('cat');
      if(h.animal.lastFedAt===undefined)h.animal.lastFedAt=Date.now();
      if(h.animal.health===undefined)h.animal.health=100;
      if(typeof h.animal.lifeId!=='string'||!/^cat-[a-zA-Z0-9_-]{1,100}$/.test(h.animal.lifeId))fail('Animal identity is invalid.');
      if(!Number.isSafeInteger(h.animal.lastFedAt)||h.animal.lastFedAt<0||h.animal.lastFedAt>8640000000000000)fail('Animal feeding time is invalid.');
      if(!Number.isFinite(h.animal.health)||h.animal.health<0||h.animal.health>100)fail('Animal health must be between 0 and 100.');
      if(h.animal.placed&&H.CollisionValidator.animal(h,h.animal.grid))h.animal.placed=false;
      if(h.animal.placed)h.animal.absentSince=null;
      else if(h.animal.absentSince==null)h.animal.absentSince=Date.now();
      if(h.animal.absentSince!==null&&(!Number.isSafeInteger(h.animal.absentSince)||h.animal.absentSince<0||h.animal.absentSince>8640000000000000))fail('Invalid cat absence time.');
      // Custom state must remain plain, bounded JSON; never hydrate executable code.
      const safe=(value,depth=0)=>{if(depth>12)fail('Custom data is nested too deeply.');if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(k))fail('Unsafe data key in file.');safe(v,depth+1);}};
      safe(h);
      for(const o of h.objects){const error=H.CollisionValidator.object(h,o,o.id);if(error)fail('Invalid '+H.Catalog[o.objectType].name+': '+error);}
      h.metadata={name:typeof h.metadata?.name==='string'?h.metadata.name.slice(0,80):'RoomBloom house',savedAt:typeof h.metadata?.savedAt==='string'?h.metadata.savedAt:null};
      return h;
    }
  }
  H.HouseModel=HouseModel;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
