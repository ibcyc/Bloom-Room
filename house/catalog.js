/* Add furniture here, its mesh in scene.js, and an optional handler in interactions.js. */
(function(H){
  'use strict';
  H.Catalog=Object.freeze({
    cat:{name:'Pip · Cat',placement:'FLOOR',color:'#d9a278',size:{x:1,y:1,z:1},interactionType:null,limit:1},
    sofa:{name:'Sofa',placement:'FLOOR',color:'#829a75',size:{x:1,y:1,z:1},interactionType:'REST',animalAction:'Sitting'},
    bed:{name:'Bed',placement:'FLOOR',color:'#d9b2a0',size:{x:1,y:1,z:1},interactionType:'REST',animalAction:'Sleeping'},
    table:{name:'Table',placement:'FLOOR',color:'#bc956d',size:{x:1,y:1,z:1},interactionType:null},
    longtable:{name:'Long table',placement:'FLOOR',color:'#bc956d',size:{x:2,y:1,z:1},interactionType:null},
    fridge:{name:'Refrigerator',placement:'FLOOR',color:'#b5cbd1',size:{x:1,y:2,z:1},interactionType:'FRIDGE'},
    vacuum:{name:'Vacuum cleaner',placement:'FLOOR',color:'#cb9a73',size:{x:1,y:1,z:1},interactionType:'TRASH_SCHEDULE'},
    custom:{name:'Custom model',placement:'FLOOR',color:'#96a5bb',size:{x:1,y:1,z:1},interactionType:null},
    trash:{name:'Trash can',placement:'FLOOR',color:'#65877c',size:{x:1,y:1,z:1},interactionType:'TRASH_SCHEDULE'},
    bowl:{name:'Food bowl',placement:'FLOOR',color:'#dbb66f',size:{x:1,y:1,z:1},interactionType:'FEED',animalAction:'Eating'},
    plant:{name:'Sprout',placement:'FLOOR',color:'#99ae77',size:{x:1,y:1,z:1},interactionType:'PLANT',tabletop:true},
    laundry:{name:'Washer & dryer',placement:'FLOOR',color:'#c8d9d8',size:{x:1,y:2,z:1},interactionType:'LAUNDRY'},
    oven:{name:'Oven',placement:'FLOOR',color:'#bdc1b3',size:{x:1,y:1,z:1},interactionType:'APPLIANCE'},
    speaker:{name:'Speaker',placement:'FLOOR',color:'#64786f',size:{x:1,y:1,z:1},interactionType:'MUSIC',tabletop:true},
    lamp:{name:'Wall lamp',placement:'WALL',color:'#efce8b',size:{x:1,y:1,z:1},mountSize:{width:.34,height:.34},interactionType:'LAMP'},
    floorlamp:{name:'Floor lamp',placement:'FLOOR',color:'#efce8b',size:{x:1,y:2,z:1},interactionType:'LAMP'},
    electricity:{name:'Electricity bill',placement:'WALL',color:'#efc66e',size:{x:1,y:1,z:1},mountSize:{width:.32,height:.42},interactionType:'BILL'},
    water:{name:'Water bill',placement:'WALL',color:'#75b9da',size:{x:1,y:1,z:1},mountSize:{width:.32,height:.42},interactionType:'BILL'},
    window:{name:'Window',placement:'WALL',color:'#9bc9ce',size:{x:1,y:1,z:1},mountSize:{width:.74,height:.46},interactionType:'LIGHTING'},
    art:{name:'Wall art',placement:'WALL',color:'#c78970',size:{x:1,y:1,z:1},mountSize:{width:.5,height:.42},interactionType:'ART'},
    board:{name:'Message board',placement:'WALL',color:'#ba956e',size:{x:1,y:1,z:1},mountSize:{width:.78,height:.6},interactionType:'BOARD'}
  });
  H.isTable=o=>['table','longtable'].includes(o?.objectType);
  H.tableSlots=o=>o.objectType==='longtable'?8:4;
  H.Finishes=Object.freeze({
    wood:{name:'Wood',roughness:.8,color:'#c6a276'},
    plaster:{name:'Plaster',roughness:1,color:'#e6dfcc'},
    tile:{name:'Tile',roughness:.3,color:'#abc4b9'}
  });
  H.DefaultMaterials={floor:{finish:'wood',color:'#d7bd94'},wall:{finish:'plaster',color:'#e4e4cf'},door:{finish:'wood',color:'#ac7c53'}};
  H.clone=value=>JSON.parse(JSON.stringify(value));
  H.uid=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  H.escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  H.objectDefinition=function(type,grid,options={}){
    const def=H.Catalog[type];
    return {id:options.id||H.uid('object'),objectType:type,placement:def.placement,grid:{x:grid.x,y:0,z:grid.z},
      size:H.clone(def.size),rotation:options.rotation||0,attachedWallId:options.wallId||null,height:options.height||1.5,
      interactionType:def.interactionType,interactionConfig:{interactionPoints:[{x:0,z:1},{x:1,z:0},{x:0,z:-1},{x:-1,z:0}]},customState:options.customState||(type==='plant'?{growth:{placedAt:Date.now(),score:100,deadAt:null,history:[]}}:{})};
  };
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
