/* Domain mutations are independent of rendering. Controller calls these systems, never UI meshes. */
(function(H){
  'use strict';
  const G=H.GridSystem;
  class CollisionValidator {
    static animal(h,grid){
      if(!G.inside(grid)||!h.structure.floors.some(f=>G.key(f.grid)===G.key(grid)))return 'Pip needs a floor cell.';
      if(h.objects.some(o=>o.placement==='FLOOR'&&G.footprint(o).some(p=>G.key(p)===G.key(grid))))return 'Another object already occupies this cell.';
      return '';
    }
    static object(h,o,ignoreId=null){
      if(o.objectType==='cat')return h.animal.placed&&ignoreId!=='pip'?'Only one cat can live here.':this.animal(h,o.grid);
      const def=H.Catalog[o.objectType];
      if(!def)return 'Unknown furniture.';
      if(o.supportId){
        if(!def.tabletop)return o.objectType==='bowl'?'Food bowls must stay on the floor.':'This object cannot be placed on a table.';
        const table=h.objects.find(item=>item.id===o.supportId&&H.isTable(item)&&!item.supportId);
        if(!table||G.key(table.grid)!==G.key(o.grid))return 'This object needs its supporting table.';
        if(!Number.isInteger(o.supportSlot)||o.supportSlot<0||o.supportSlot>=H.tableSlots(table))return 'Choose a position on the tabletop.';
        if(h.objects.some(item=>item.id!==ignoreId&&item.supportId===o.supportId&&item.supportSlot===o.supportSlot))return 'This tabletop position is occupied.';
        return '';
      }
      if(o.placement==='WALL'){
        const wall=h.structure.walls.find(w=>w.id===o.attachedWallId);
        if(!wall)return 'Choose a wall for this object.';
        if(wall.grid.x!==o.grid.x||wall.grid.z!==o.grid.z)return 'Position must follow the attached wall.';
        if(h.structure.doors.some(d=>d.wallId===wall.id))return 'A doorway needs to stay clear.';
        if(![1,1.5,2].includes(o.height))return 'Choose a supported mounting height.';
        const extent=item=>{const size=H.Catalog[item.objectType].mountSize;return item.rotation%180?size.width:size.height;};
        if(o.height+extent(o)/2>2.4||o.height-extent(o)/2<.1)return 'This object extends beyond the wall height.';
        if(h.objects.some(other=>other.id!==ignoreId&&other.placement==='WALL'&&other.attachedWallId===wall.id&&Math.abs(other.height-o.height)<(extent(o)+extent(other))/2+.01))return 'This wall height is already occupied.';
        return '';
      }
      const floors=new Set(h.structure.floors.map(f=>G.key(f.grid))), cells=G.footprint(o), own=new Set(cells.map(p=>G.key(p)));
      if(cells.some(p=>!G.inside(p)||!floors.has(G.key(p))))return 'Furniture needs a floor under every cell.';
      for(const other of h.objects)if(other.id!==ignoreId&&!other.supportId&&other.placement==='FLOOR'&&G.footprint(other).some(p=>own.has(G.key(p))))return o.objectType==='bowl'&&H.isTable(other)?'Food bowls must stay on the floor.':'Another object already occupies this cell.';
      const walls=new Set(h.structure.walls.map(w=>G.edge(w.grid,w.side)));
      for(const p of cells)for(const n of G.neighbours(p))if(own.has(G.key(n))&&walls.has(G.crossing(p,n)))return 'A wall crosses this furniture footprint.';
      return '';
    }
  }
  class PlacementCleanup {
    static revalidate(h){
      const removed=[];
      let changed;do{changed=false;for(const o of [...h.objects])if(CollisionValidator.object(h,o,o.id)){
        h.objects=h.objects.filter(item=>item.id!==o.id);removed.push(o);changed=true;
      }}while(changed);
      if(h.animal.placed&&CollisionValidator.animal(h,h.animal.grid)){
        h.animal.placed=false;h.animal.absentSince=Date.now();removed.push(h.animal);
      }
      return removed;
    }
  }
  class StructureSystem {
    constructor(h){this.house=h;}
    preview(kind,target){
      const h=this.house,p=target.grid;
      if(!p||!G.inside(p))return 'Build inside the marked grid.';
      if(kind==='floor'){
        if(h.structure.floors.some(f=>G.key(f.grid)===G.key(p)))return 'There is already a floor here.';
        if(!h.structure.floors.length)return p.x===0&&p.z===0?'':'Start with the highlighted origin cell (0, 0).';
        if(!h.structure.floors.some(f=>G.neighbours(p).some(n=>G.key(n)===G.key(f.grid))))return 'New floors must touch an existing floor edge.';
      } else if(kind==='wall'){
        if(!h.structure.floors.some(f=>G.key(f.grid)===G.key(p)))return 'Build a floor before placing a wall.';
        if(h.structure.walls.some(w=>G.edge(w.grid,w.side)===G.edge(p,target.side)))return 'There is already a wall on this edge.';
        const ends=G.endpoints({grid:p,side:target.side});
        if(h.structure.walls.length&&!h.structure.walls.some(w=>G.endpoints(w).some(e=>ends.includes(e))))return 'New walls must connect to an existing wall endpoint.';
      } else if(kind==='door'){
        if(!h.structure.walls.some(w=>w.id===target.wallId))return 'A door must attach to an existing wall.';
        if(h.structure.doors.some(d=>d.wallId===target.wallId))return 'This wall already has a door.';
      } else return 'Choose Floor, Wall, or Door.';
      return '';
    }
    place(kind,target){
      const error=this.preview(kind,target);if(error)throw new Error(error);
      const h=this.house;
      if(kind==='floor')h.structure.floors.push({id:H.uid('floor'),grid:{...target.grid,y:0},rotation:target.rotation||0});
      if(kind==='wall')h.structure.walls.push({id:H.uid('wall'),grid:{...target.grid,y:0},side:target.side});
      if(kind==='door')h.structure.doors.push({id:H.uid('door'),wallId:target.wallId,locked:true});
      return PlacementCleanup.revalidate(h);
    }
    remove(kind,id){
      const h=this.house,s=h.structure;
      if(kind==='floor'){
        const f=s.floors.find(item=>item.id===id);if(!f)throw new Error('Select a floor to remove.');
        const next=s.floors.filter(item=>item!==f);
        if(!G.connected(next))throw new Error('That would split the floor. Remove an outer cell first.');
        s.floors=next;
        for(const wall of [...s.walls])if(G.key(wall.grid)===G.key(f.grid))this.removeWall(wall.id);
      }else if(kind==='wall')this.removeWall(id);
      else if(kind==='door')s.doors=s.doors.filter(d=>d.id!==id);
      else throw new Error('Choose a structure to remove.');
      delete h.materials[id];
      return PlacementCleanup.revalidate(h);
    }
    removeWall(id){
      const h=this.house;
      for(const d of h.structure.doors.filter(d=>d.wallId===id))delete h.materials[d.id];
      h.structure.doors=h.structure.doors.filter(d=>d.wallId!==id);
      h.structure.walls=h.structure.walls.filter(w=>w.id!==id);delete h.materials[id];
    }
  }
  class ObjectSystem {
    constructor(h){this.house=h;}
    candidate(type,target,rotation,height,custom=null){
      const o=H.objectDefinition(type,target.grid,{rotation,height,wallId:target.wallId});
      if(type==='custom'&&custom){o.size=H.clone(custom.size);o.customState.model=H.clone(custom.model);}
      if(target.supportId&&o.placement==='FLOOR'){o.supportId=target.supportId;o.supportSlot=target.supportSlot;}
      if(o.placement==='WALL')o.grid.y=height/G.HEIGHT_STEP;
      return o;
    }
    place(type,target,rotation,height,custom=null){
      if(type==='cat'){
        if(this.house.animal.placed)throw new Error('Only one cat can live here.');
        const error=CollisionValidator.animal(this.house,target.grid);if(error)throw new Error(error);
        Object.assign(this.house.animal,{placed:true,absentSince:null,grid:{...target.grid,y:0},lifeId:H.uid('cat'),lastFedAt:Date.now(),health:100});return this.house.animal;
      }
      if(this.house.objects.length>=200)throw new Error('Place up to 200 objects. Remove an object first.');
      const o=this.candidate(type,target,rotation,height,custom),error=CollisionValidator.object(this.house,o);
      if(error)throw new Error(error);this.house.objects.push(o);PlacementCleanup.revalidate(this.house);return o;
    }
    moveCandidate(id,target,rotation,height){
      const original=this.house.objects.find(o=>o.id===id);if(!original)throw new Error('Select an object to move.');
      const next=this.candidate(original.objectType,target,rotation,height);next.id=id;next.size=H.clone(original.size);next.customState=H.clone(original.customState);next.interactionConfig=H.clone(original.interactionConfig);return next;
    }
    move(id,target,rotation,height){
      if(id==='pip'){if(!this.house.animal.placed)throw new Error('Pip is no longer in the room.');const error=CollisionValidator.animal(this.house,target.grid);if(error)throw new Error(error);this.house.animal.grid={...target.grid,y:0};return this.house.animal;}
      const next=this.moveCandidate(id,target,rotation,height),error=CollisionValidator.object(this.house,next,id);if(error)throw new Error(error);
      const index=this.house.objects.findIndex(o=>o.id===id);this.house.objects[index]=next;
      for(const child of this.house.objects.filter(o=>o.supportId===id))child.grid={...next.grid};
      return next;
    }
    remove(id){
      if(id==='pip'&&this.house.animal.placed){this.house.animal.placed=false;this.house.animal.absentSince=Date.now();return;}
      const o=this.house.objects.find(o=>o.id===id);if(!o)throw new Error('Select furniture to remove.');
      this.house.objects=this.house.objects.filter(item=>item!==o);
      PlacementCleanup.revalidate(this.house);
    }
    rotate(id){
      const o=this.house.objects.find(o=>o.id===id);if(!o)throw new Error('Select furniture to rotate.');
      const next={...o,rotation:(o.rotation+90)%360},error=CollisionValidator.object(this.house,next,id);
      if(error)throw new Error(error);o.rotation=next.rotation;
    }
    setHeight(id,height){
      const o=this.house.objects.find(o=>o.id===id);if(!o||o.placement!=='WALL')throw new Error('Select wall furniture first.');
      const next={...o,height,grid:{...o.grid,y:height/G.HEIGHT_STEP}},error=CollisionValidator.object(this.house,next,id);
      if(error)throw new Error(error);o.height=height;o.grid.y=height/G.HEIGHT_STEP;
    }
  }
  class MaterialSystem {
    constructor(h){this.house=h;}
    paint(id,finish,color){if(!Object.hasOwn(H.Finishes,finish)||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Choose a valid finish and color.');this.house.materials[id]={finish,color};}
    reset(id){delete this.house.materials[id];}
    get(id,kind){return this.house.materials[id]||H.DefaultMaterials[kind];}
  }
  Object.assign(H,{CollisionValidator,PlacementCleanup,StructureSystem,ObjectSystem,MaterialSystem});
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
