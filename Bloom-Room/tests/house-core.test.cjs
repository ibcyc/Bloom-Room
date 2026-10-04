const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.resolve(__dirname,'../house')+path.sep;
for(const name of ['grid','catalog','features','tasks','presets/default-house','model','systems','navigation','save','animal'])vm.runInThisContext(fs.readFileSync(base+name+'.js','utf8'),{filename:name+'.js'});
const H=globalThis.RoomBloomHouse,G=H.GridSystem;
const target=(x,z,side='N',wallId=null)=>({grid:{x,y:0,z},side,wallId});
function strip(length=4){
 const h=H.HouseModel.empty();
 for(let x=0;x<length;x++)h.structure.floors.push({id:'f'+x,grid:{x,y:0,z:0}});
 h.animal.grid={x:0,y:0,z:0};return h;
}
test('Default and empty presets validate and round-trip',()=>{
 for(const h of [H.HouseModel.basic(),H.HouseModel.empty()])assert.deepEqual(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)),h);
});
test('First floor is anchored; extensions must touch an edge',()=>{
 const h=H.HouseModel.empty(),s=new H.StructureSystem(h);
 assert.throws(()=>s.place('floor',target(2,2)),/origin/);s.place('floor',target(0,0));
 assert.throws(()=>s.place('floor',target(1,1)),/touch/);s.place('floor',target(1,0));assert.equal(h.structure.floors.length,2);
});
test('Walls need support and connected endpoints; doors require a wall',()=>{
 const h=strip(),s=new H.StructureSystem(h);
 assert.throws(()=>s.place('wall',target(8,8)),/floor/);s.place('wall',target(0,0));
 assert.throws(()=>s.place('wall',target(3,0)),/connect/);s.place('wall',target(1,0));
 assert.throws(()=>s.place('door',target(1,0)),/wall/);const wall=h.structure.walls[1];s.place('door',target(1,0,'N',wall.id));
 assert.throws(()=>s.place('door',target(1,0,'N',wall.id)),/already/);
});
test('Floor furniture requires floor and cannot overlap; rotation is four-step',()=>{
 const h=strip(),os=new H.ObjectSystem(h);
 assert.throws(()=>os.place('sofa',target(8,8),0,1.5),/floor/);const o=os.place('sofa',target(1,0),0,1.5);
 assert.throws(()=>os.place('bed',target(1,0),0,1.5),/occupies/);
 for(const expected of [90,180,270,0]){os.rotate(o.id);assert.equal(o.rotation,expected);}
});
test('Future rectangular footprints rotate and detect internal wall collisions',()=>{
 const h=strip(),o=H.objectDefinition('sofa',{x:0,z:0});o.size={x:2,y:1,z:1};
 assert.equal(G.footprint(o).length,2);assert.equal(H.CollisionValidator.object(h,o),'');
 h.structure.walls.push({id:'w',grid:{x:1,y:0,z:0},side:'W'});assert.match(H.CollisionValidator.object(h,o),/crosses/);
 o.rotation=90;assert.match(H.CollisionValidator.object(h,o),/floor/);
});
test('Wall objects attach at grid height, do not overlap, and are removed after wall loss',()=>{
 const h=strip(),ss=new H.StructureSystem(h),os=new H.ObjectSystem(h);ss.place('wall',target(0,0));
 const wall=h.structure.walls[0];
 assert.throws(()=>os.place('window',target(0,0),0,1.5),/wall/);
 const a=os.place('window',target(0,0,'N',wall.id),0,1.5),b=os.place('lamp',target(0,0,'N',wall.id),0,2);
 assert.equal(a.grid.y,3);assert.equal(b.grid.y,4);assert.throws(()=>os.setHeight(b.id,1.5),/occupied/);
 assert.throws(()=>os.setHeight(a.id,1.3),/height/);
 ss.remove('wall',wall.id);assert.equal(h.objects.length,0);assert.equal(h.storage,undefined);H.HouseModel.validate(h);
});
test('Deleted floors remove furniture; catalog placement creates a fresh item',()=>{
 const h=strip(),os=new H.ObjectSystem(h),ss=new H.StructureSystem(h);
 const o=os.place('trash',target(3,0),90,1.5);o.customState={schedule:{order:['self','alex'],nextIndex:1,note:'Recycle'}};
 ss.remove('floor','f3');assert.equal(h.objects.length,0);assert.equal(h.storage,undefined);
 const fresh=os.place('trash',target(2,0),90,1.5);assert.notEqual(fresh.id,o.id);assert.deepEqual(fresh.customState,{});
 assert.throws(()=>ss.remove('floor','f1'),/split/);
});
test('Door construction removes wall furniture and wall removal cleans doors and material references',()=>{
 const h=strip(),ss=new H.StructureSystem(h),os=new H.ObjectSystem(h);ss.place('wall',target(0,0));const wall=h.structure.walls[0];
 os.place('art',target(0,0,'N',wall.id),0,1.5);ss.place('door',target(0,0,'N',wall.id));assert.equal(h.objects.length,0);
 const door=h.structure.doors[0];new H.MaterialSystem(h).paint(door.id,'tile','#123456');
 ss.remove('wall',wall.id);assert.equal(h.structure.doors.length,0);assert.equal(Object.keys(h.materials).length,0);H.HouseModel.validate(h);
});
test('Painting modifies material data only and resets to defaults',()=>{
 const h=H.HouseModel.basic(),geometry=JSON.stringify(h.structure),m=new H.MaterialSystem(h);m.paint(h.structure.floors[0].id,'tile','#abcdef');
 assert.equal(JSON.stringify(h.structure),geometry);assert.equal(m.get(h.structure.floors[0].id,'floor').color,'#abcdef');m.reset(h.structure.floors[0].id);assert.deepEqual(m.get(h.structure.floors[0].id,'floor'),H.DefaultMaterials.floor);
});
test('A* respects walls and closed doors, including legacy unlocked flags, floor and occupancy',()=>{
 const h=strip(),start={x:0,z:0},goal={x:3,z:0};let nav=new H.NavigationSystem(h);assert.equal(nav.path(start,goal).length,4);
 h.structure.walls.push({id:'w',grid:{x:2,y:0,z:0},side:'W'});assert.equal(new H.NavigationSystem(h).path(start,goal),null);
 h.structure.doors.push({id:'d',wallId:'w',locked:true});assert.equal(new H.NavigationSystem(h).path(start,goal),null);
 h.structure.doors[0].locked=false;assert.equal(new H.NavigationSystem(h).path(start,goal),null);
 assert.equal(H.HouseModel.validate(h).structure.doors[0].locked,true);
 h.objects.push(H.objectDefinition('table',{x:1,z:0}));assert.equal(new H.NavigationSystem(h).path(start,goal),null);
 assert.equal(nav.path(start,{x:6,z:0}),null);
});
test('A* returns shortest reachable interaction point, never the furniture cell',()=>{
 const h=strip(5),o=H.objectDefinition('sofa',{x:3,z:0});h.objects.push(o);
 const path=new H.NavigationSystem(h).nearestGoal({x:0,z:0},'sofa').path;
 assert.equal(path.length,3);assert.deepEqual(path.at(-1),{x:2,y:0,z:0});
});
test('Animal follows legal edges, enters sitting state and is removed when its floor is deleted',()=>{
 const h=strip(5);h.animal.placed=true;h.objects.push(H.objectDefinition('sofa',{x:3,z:0}));const animal=new H.AnimalSystem(h);animal.go('sofa');
 for(let i=0;i<100&&animal.state!=='Sitting';i++)animal.update(.1);
 assert.equal(animal.state,'Sitting');assert.deepEqual(animal.grid,{x:2,y:0,z:0});
 assert.equal(animal.position.y,.47);assert.equal(animal.position.x,3.5);assert.equal(animal.position.z,.58);
 h.structure.floors=h.structure.floors.filter(f=>f.grid.x!==2);animal.rebuild(h);assert.equal(animal.visible,false);assert.equal(h.animal.placed,false);
 const empty=H.HouseModel.empty();animal.rebuild(empty);assert.equal(animal.visible,false);
});
test('Import rejects unknown versions, duplicate IDs, invalid attachment and malformed JSON atomically',()=>{
 const original=H.HouseModel.basic(),cases=[];
 let h=H.clone(original);h.version=2;cases.push(h);
 h=H.clone(original);h.structure.floors[1].id=h.structure.floors[0].id;cases.push(h);
 h=H.clone(original);h.objects.find(o=>o.placement==='WALL').attachedWallId='missing';cases.push(h);
 h=H.clone(original);h.objects[0].grid.x=100;cases.push(h);
 h=H.clone(original);h.objects[0].rotation=45;cases.push(h);
 for(const value of cases)assert.throws(()=>H.HouseModel.validate(value));
 assert.throws(()=>H.ImportExportSystem.parse('{broken'));assert.throws(()=>H.ImportExportSystem.parse(' '.repeat(2*1024*1024+1)));
 assert.equal(original.version,1);assert.equal(original.structure.floors.length,30);
});
test('Save/load includes both layers, custom state, materials and cat placement; rooms are isolated',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const a=new H.SaveSystem('A');a.load();const h=H.HouseModel.basic();h.objects.find(o=>o.objectType==='trash').customState={note:'Keep me'};
 new H.MaterialSystem(h).paint(h.structure.floors[0].id,'tile','#abcdef');new H.ObjectSystem(h).remove(h.objects[0].id);
 const saved=a.save(h);assert.deepEqual(new H.SaveSystem('A').load().house,saved);assert.equal(new H.SaveSystem('B').load().house.storage,undefined);
 a.draft(h);assert.equal(new H.SaveSystem('A').load().dirty,true);a.discardDraft();assert.equal(new H.SaveSystem('A').load().dirty,false);
});
test('Storage failures are reported without claiming a successful save',()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{}};
 const repo=new H.SaveSystem('A');assert.throws(()=>repo.save(H.HouseModel.basic()),/could not save/);assert.equal(repo.draft(H.HouseModel.basic()),false);
});
test('Import rejects reserved IDs, inherited catalog keys and invalid interaction state',()=>{
 let h=H.HouseModel.basic();h.structure.floors[0].id='__proto__';assert.throws(()=>H.HouseModel.validate(h),/ID/);
 h=H.HouseModel.basic();h.objects[0].objectType='constructor';assert.throws(()=>H.HouseModel.validate(h),/unknown/);
 h=H.HouseModel.basic();h.materials[h.structure.floors[0].id]={finish:'constructor',color:'#abcdef'};assert.throws(()=>H.HouseModel.validate(h),/material/);
 h=H.HouseModel.basic();h.objects.find(o=>o.objectType==='trash').customState={schedule:{order:'invalid'}};assert.throws(()=>H.HouseModel.validate(h),/schedule/);
});
test('Rotated wall objects validate their actual vertical footprint',()=>{
 const h=strip(),ss=new H.StructureSystem(h),os=new H.ObjectSystem(h);ss.place('wall',target(0,0));const wall=h.structure.walls[0];
 const a=os.place('window',target(0,0,'N',wall.id),0,1.5);os.place('window',target(0,0,'N',wall.id),0,2);
 assert.throws(()=>os.rotate(a.id),/occupied/);assert.equal(a.rotation,0);
});
test('Interaction points on the opposite side of a wall cannot be used',()=>{
 const h=H.HouseModel.empty();
 for(let x=0;x<3;x++)for(let z=0;z<2;z++)h.structure.floors.push({id:'f-'+x+'-'+z,grid:{x,y:0,z}});
 h.structure.walls.push({id:'divider',grid:{x:1,y:0,z:0},side:'W'});h.objects.push(H.objectDefinition('sofa',{x:1,z:0}));
 const goal=new H.NavigationSystem(h).nearestGoal({x:0,z:0},'sofa');
 assert.equal(goal.path.length,3);assert.deepEqual(goal.path.at(-1),{x:1,y:0,z:1});
});

test('Cat placement is optional, singleton, collision checked and removable',()=>{
 const h=strip(3),os=new H.ObjectSystem(h);
 assert.equal(h.animal.placed,false);
 assert.throws(()=>os.place('cat',target(9,9),0,1.5),/floor/);
 os.place('plant',target(1,0),0,1.5);
 assert.throws(()=>os.place('cat',target(1,0),0,1.5),/occupies/);
 os.place('cat',target(0,0),0,1.5);assert.equal(h.animal.placed,true);
 assert.throws(()=>os.place('cat',target(2,0),0,1.5),/one cat/);
 os.remove('pip');assert.equal(h.animal.placed,false);
 os.place('cat',target(2,0),0,1.5);
 assert.deepEqual(h.animal.grid,{x:2,y:0,z:0});
 assert.equal(new H.AnimalSystem(h).visible,true);H.HouseModel.validate(h);
});
test('Removing cat support or placing furniture over it removes the cat without relocation',()=>{
 const h=strip(3),os=new H.ObjectSystem(h),ss=new H.StructureSystem(h);
 os.place('cat',target(2,0),0,1.5);ss.remove('floor','f2');assert.equal(h.animal.placed,false);
 os.place('cat',target(1,0),0,1.5);os.place('plant',target(1,0),0,1.5);assert.equal(h.animal.placed,false);
 assert.equal(h.objects.length,1);assert.equal(new H.AnimalSystem(h).visible,false);
});
test('Legacy inventory migrates out; current placed objects and cat survive round trips',()=>{
 const h=H.HouseModel.basic();h.storage=[{legacy:'retired inventory'}];delete h.animal.placed;
 const clean=H.HouseModel.validate(h);assert.equal(clean.storage,undefined);assert.equal(clean.animal.placed,true);
 assert.deepEqual(clean.objects,h.objects);assert.equal(h.storage.length,1);
 assert.deepEqual(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(clean)),clean);
 const empty=H.HouseModel.empty();delete empty.animal.placed;
 assert.equal(H.HouseModel.validate(empty).animal.placed,false);
});
test('Undo snapshots restore removed furniture and cat with their original custom state',()=>{
 const h=strip(3),os=new H.ObjectSystem(h);os.place('cat',target(0,0),0,1.5);
 const o=os.place('trash',target(2,0),90,1.5);o.customState={note:'Keep my original state'};
 const before=H.clone(h);new H.StructureSystem(h).remove('floor','f2');os.remove('pip');
 const restored=H.HouseModel.validate(before);assert.equal(restored.animal.placed,true);
 assert.equal(restored.objects[0].id,o.id);assert.deepEqual(restored.objects[0].customState,o.customState);
});

test('Editor preferences persist and validate settings without restoring a previous Type',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const choices={layer:'OBJECT',buildRotation:90,height:2,finish:'tile',color:'#123abc'};
 assert.equal(H.EditorPreferences.save({...choices,build:'door',editing:true,selected:{id:'temporary'}}),true);
 assert.deepEqual(H.EditorPreferences.load(),choices);
 assert.equal(Object.hasOwn(JSON.parse(memory.get(H.EditorPreferences.key)),'build'),false);
 memory.set(H.EditorPreferences.key,JSON.stringify({...choices,build:'wall'}));assert.deepEqual(H.EditorPreferences.load(),choices);
 memory.set(H.EditorPreferences.key,'{invalid');assert.equal(H.EditorPreferences.load().layer,'STRUCTURE');
 memory.set(H.EditorPreferences.key,JSON.stringify({layer:'bad',build:'ceiling',buildRotation:45,height:9,finish:'constructor',color:'red'}));
 assert.deepEqual(H.EditorPreferences.load(),H.EditorPreferences.clean());
 globalThis.localStorage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
 assert.deepEqual(H.EditorPreferences.load(),H.EditorPreferences.clean());assert.equal(H.EditorPreferences.save(choices),false);
});
test('Rotated floor previews place the same rotation and round-trip through JSON',()=>{
 const h=H.HouseModel.empty(),s=new H.StructureSystem(h);
 s.place('floor',{...target(0,0),rotation:90});assert.equal(h.structure.floors[0].rotation,90);
 assert.equal(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)).structure.floors[0].rotation,90);
 h.structure.floors[0].rotation=45;assert.throws(()=>H.HouseModel.validate(h),/rotation/);
});

test('Cat hunger uses exact wall-clock boundaries and a 24-hour deadline',()=>{
 const a=H.HouseModel.basic().animal,now=Date.now(),hour=3600000;a.lastFedAt=now;
 for(const [elapsed,label] of [[0,'full'],[6*hour-1,'full'],[6*hour,'ok'],[12*hour,'hungry'],[18*hour,'horrible']]){
  const status=H.AnimalSystem.status(a,now+elapsed);assert.equal(status.hunger,label);assert.equal(status.remaining,24*hour-elapsed);assert.equal(status.health,100);
 }
 assert.equal(H.AnimalSystem.status(a,now+24*hour).expired,true);
 assert.equal(H.AnimalSystem.status(a,now-1000).remaining,24*hour);
});
test('Reachable food is sought automatically, consumed once, and timed from completion',()=>{
 const h=strip(5),now=Date.now();h.animal.placed=true;h.animal.lastFedAt=now-20*3600000;
 const bowl=H.objectDefinition('bowl',{x:3,z:0});h.objects.push(bowl);const animal=new H.AnimalSystem(h);
 let fedAt;
 for(let i=0;i<100;i++){const time=now+i*100;animal.update(.1,time,false);const event=animal.takeEvents().find(e=>e.type==='fed');if(event){fedAt=event.lastFedAt;assert.equal(fedAt,time);break;}}
 assert.ok(fedAt>now);assert.equal(h.objects.length,0);assert.equal(h.animal.lastFedAt,fedAt);assert.equal(H.AnimalSystem.status(h.animal,fedAt).hunger,'full');
 for(let i=0;i<10;i++)animal.update(.1,fedAt+1000,false);assert.equal(animal.takeEvents().length,0);
 const restored=H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h));assert.equal(restored.animal.lastFedAt,fedAt);
});
test('An unreachable bowl cannot feed through a closed door',()=>{
 const h=strip(5),now=Date.now();h.animal.placed=true;h.animal.lastFedAt=now-20*3600000;
 h.objects.push(H.objectDefinition('bowl',{x:4,z:0}));h.structure.walls.push({id:'wall',grid:{x:2,y:0,z:0},side:'W'});h.structure.doors.push({id:'door',wallId:'wall',locked:false});
 const animal=new H.AnimalSystem(h);for(let i=0;i<100;i++)animal.update(.1,now+i*100,false);
 assert.equal(h.objects.length,1);assert.equal(h.animal.lastFedAt,now-20*3600000);assert.deepEqual(animal.grid,{x:0,y:0,z:0});assert.equal(animal.takeEvents().length,0);
});
test('Offline expiry removes the cat once, persists, and a new placement starts a new life',()=>{
 const h=strip(3),now=Date.now();h.animal.placed=true;h.animal.lastFedAt=now-24*3600000;const life=h.animal.lifeId;
 const animal=new H.AnimalSystem(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)));
 animal.checkVitals(now);animal.checkVitals(now+1000);assert.equal(animal.house.animal.placed,false);assert.equal(animal.house.animal.health,0);assert.equal(animal.takeEvents().length,1);
 new H.ObjectSystem(animal.house).place('cat',target(1,0),0,1.5);assert.equal(animal.house.animal.health,100);assert.notEqual(animal.house.animal.lifeId,life);assert.ok(animal.house.animal.lastFedAt>=now);
});
test('A selected bed is reached by a legal adjacent cell, then occupied above its mattress',()=>{
 const h=strip(7);h.animal.placed=true;
 const bed=H.objectDefinition('bed',{x:4,z:0},{rotation:90});h.objects.push(bed);const animal=new H.AnimalSystem(h);animal.go('bed',bed.id);
 for(let i=0;i<100&&animal.state!=='Sleeping';i++)animal.update(.1,Date.now(),false);
 assert.equal(animal.state,'Sleeping');assert.equal(animal.position.y,.42);assert.equal(animal.position.x,4.42);assert.equal(animal.position.z,.5);
 animal.go('wander');for(let i=0;i<5;i++)animal.update(.1,Date.now(),false);assert.equal(animal.position.y,0);
});
test('Legacy cats receive care fields and malformed feeding state is rejected',()=>{
 const legacy=H.HouseModel.basic();delete legacy.animal.lifeId;delete legacy.animal.lastFedAt;delete legacy.animal.health;
 const h=H.HouseModel.validate(legacy);assert.equal(h.animal.health,100);assert.equal(H.AnimalSystem.status(h.animal).hunger,'full');
 for(const value of [-1,'yesterday',Infinity]){const bad=H.clone(h);bad.animal.lastFedAt=value;assert.throws(()=>H.HouseModel.validate(bad),/feeding time/);}
 const bad=H.clone(h);bad.animal.health=101;assert.throws(()=>H.HouseModel.validate(bad),/health/);
});

test('Tabletop objects have distinct slots, rotate with their table and are removed together',()=>{
 const h=strip(4),os=new H.ObjectSystem(h),table=os.place('table',target(1,0),0,1.5);
 const onTable=slot=>({...target(1,0),supportId:table.id,supportSlot:slot});
 const plant=os.place('plant',onTable(0),0,1.5),speaker=os.place('speaker',onTable(3),0,1.5);
 assert.throws(()=>os.place('plant',onTable(0),0,1.5),/occupied/);
 assert.throws(()=>os.place('bowl',onTable(1),0,1.5),/floor/);
 assert.throws(()=>os.place('bed',onTable(1),0,1.5),/cannot/);
 os.rotate(table.id);const snapshot=H.HouseModel.validate(h);assert.equal(snapshot.objects.find(o=>o.id===plant.id).supportId,table.id);
 os.remove(table.id);assert.equal(h.objects.length,0);assert.equal(H.HouseModel.validate(snapshot).objects.length,3);
 const restored=H.clone(snapshot);restored.objects.reverse();new H.StructureSystem(restored).remove('floor','f3');new H.StructureSystem(restored).remove('floor','f2');new H.StructureSystem(restored).remove('floor','f1');assert.equal(restored.objects.length,0);
 const orphan=H.clone(snapshot);orphan.objects=orphan.objects.filter(o=>o.id!==table.id);assert.throws(()=>H.HouseModel.validate(orphan),/supporting table/);
 assert.notEqual(plant.id,speaker.id);
});
test('Laundry reservations reject overlaps, separate the two machines, and queue in free gaps',()=>{
 const h=strip(4),o=new H.ObjectSystem(h).place('laundry',target(2,0),0,1.5),now=Date.now(),F=H.HouseFeatures;
 const fixed=F.reserve(o,'washer','self',now+60*60000,60,{now});
 assert.throws(()=>F.reserve(o,'washer','alex',now+90*60000,60,{now}),/overlaps/);
 assert.throws(()=>F.reserve(o,'washer','alex',now,30,{queue:true,now}),/available/);
 const gap=F.reserve(o,'washer','alex',now,30,{now});assert.equal(gap.startAt,now);
 const queued=F.reserve(o,'washer','sam',now,60,{queue:true,now});assert.equal(queued.startAt,fixed.endAt);
 assert.equal(F.reserve(o,'dryer','self',now,60,{now}).startAt,now);H.HouseModel.validate(h);
 const invalid=H.clone(h);invalid.objects[0].customState.machines.washer.push({...fixed,id:'other'});assert.throws(()=>H.HouseModel.validate(invalid),/overlap/);
});
test('Wall board tasks validate assignees and deadlines and survive export',()=>{
 const h=strip(2),ss=new H.StructureSystem(h);ss.place('wall',target(0,0));
 const o=new H.ObjectSystem(h).place('board',target(0,0,'N',h.structure.walls[0].id),0,1.5),members=[{id:'self'},{id:'alex'}],now=Date.now();
 const t=H.HouseFeatures.addTask(o,'Buy milk',['self','alex'],now+3600000,members,now);
 assert.equal(t.assignees.length,2);assert.throws(()=>H.HouseFeatures.addTask(o,'Past',['self'],now-1,members,now),/future/);assert.throws(()=>H.HouseFeatures.addTask(o,'Unknown',['missing'],now+1,members,now),/roommate/);
 t.completedAt=now;assert.equal(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)).objects[0].customState.tasks[0].completedAt,now);
});
test('Door requests are addressed to distinct roommates and responses cannot be replayed',()=>{
 const h=H.HouseModel.empty(),members=[{id:'self'},{id:'alex'},{id:'sam'}],now=Date.now();h.social.isPublic=true;
 const r=H.HouseFeatures.send(h,'Could you bring bread?','self',['alex','sam','alex'],members,now);
 H.HouseFeatures.respond(h,r.id,'alex','accepted',now+1);assert.equal(r.recipients[1].response,'pending');
 assert.throws(()=>H.HouseFeatures.respond(h,r.id,'self','accepted'),/not addressed/);assert.throws(()=>H.HouseFeatures.respond(h,r.id,'alex','declined'),/already/);
 H.HouseFeatures.respond(h,r.id,'sam','declined',now+2);const restored=H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h));assert.equal(restored.social.isPublic,true);assert.equal(restored.social.requests[0].recipients[1].response,'declined');
});
test('Legacy art gains its upload interaction and unsafe image/audio payloads are rejected',()=>{
 const h=strip(2),ss=new H.StructureSystem(h);ss.place('wall',target(0,0));const o=new H.ObjectSystem(h).place('art',target(0,0,'N',h.structure.walls[0].id),0,1.5);o.interactionType=null;
 assert.equal(H.HouseModel.validate(h).objects[0].interactionType,'ART');o.customState.image='javascript:alert(1)';assert.throws(()=>H.HouseModel.validate(h),/picture/);
 delete o.customState.image;const speaker=new H.ObjectSystem(h).place('speaker',target(1,0),0,1.5);
 speaker.customState.music={loop:'playlist',volume:.3,tracks:[{id:'audio-test',name:'Test.wav',duration:1,bytes:4,mime:'audio/wav'}]};
 assert.throws(()=>H.ImportExportSystem.parse(JSON.stringify(h)),/missing its audio/);
 h.assets={'audio-test':{mime:'audio/wav',data:'AAAAAA=='}};assert.equal(H.ImportExportSystem.parse(JSON.stringify(h)).objects[1].customState.music.tracks.length,1);
 h.assets['audio-test'].data='<script>';assert.throws(()=>H.HouseModel.validate(h),/bundled audio/);
});
test('Window lighting follows local time and preserves manual extremes and legacy windows',()=>{
 const F=H.HouseFeatures,h=H.HouseModel.basic();h.objects.find(o=>o.objectType==='window').interactionType=null;
 assert.equal(H.HouseModel.validate(h).objects.find(o=>o.objectType==='window').interactionType,'LIGHTING');
 assert.equal(F.lightLevel({mode:'manual',level:0}),0);assert.equal(F.lightLevel({mode:'manual',level:1}),1);
 const day=new Date(2026,9,4,12,0),night=new Date(2026,9,4,0,0);
 assert.equal(F.lightLevel({mode:'auto'},day),1);assert.equal(F.lightLevel({mode:'auto'},night),.05);
 h.lighting.level=2;assert.throws(()=>H.HouseModel.validate(h),/lighting/);
});
test('Weather migrates older houses and survives save/export without changing the layout',()=>{
 const h=H.HouseModel.basic(),before=H.clone(h.structure);delete h.weather;
 const migrated=H.HouseModel.validate(h),w=migrated.weather;
 assert.equal(w.mode,'auto');assert.ok(['sunny','rain','snow'].includes(w.kind));
 assert.ok(w.nextChangeAt>=Date.now()+29*60000&&w.nextChangeAt<=Date.now()+60*60000);
 assert.deepEqual(migrated.structure,before);
 assert.deepEqual(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(migrated)).weather,w);
});
test('Automatic weather lasts 30–60 minutes, changes only when due and skips missed spells',()=>{
 const F=H.HouseFeatures,now=Date.now(),h=H.HouseModel.empty();
 const shortest=F.newWeather(now,()=>0),longest=F.newWeather(now,()=>.999999);
 assert.equal(shortest.nextChangeAt-now,30*60000);assert.ok(longest.nextChangeAt-now<=60*60000&&longest.nextChangeAt-now>59*60000);
 h.weather=shortest;const due=h.weather.nextChangeAt;
 assert.equal(F.advanceWeather(h,due-1,()=>0),false);assert.equal(h.weather.kind,'sunny');
 assert.equal(F.advanceWeather(h,due,()=>0),true);assert.equal(h.weather.kind,'rain');
 assert.equal(h.weather.nextChangeAt,due+30*60000);
 const later=now+7*86400000;assert.equal(F.advanceWeather(h,later,()=>.5),true);
 assert.equal(h.weather.kind,'snow');assert.equal(h.weather.nextChangeAt,later+45*60000);
 assert.equal(F.advanceWeather(h,later+1),false);
});
test('Manual weather persists, stays fixed until changed, and rejects malformed imports',()=>{
 const F=H.HouseFeatures,h=H.HouseModel.basic(),now=Date.now();
 F.setWeather(h,'snow',now);const restored=H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h));
 assert.deepEqual(restored.weather,h.weather);assert.equal(F.advanceWeather(restored,now+7*86400000),false);
 assert.equal(restored.weather.kind,'snow');F.setWeather(restored,'auto',now);
 assert.equal(restored.weather.kind,'snow');assert.equal(F.advanceWeather(restored,now),false);
 assert.throws(()=>F.setWeather(restored,'storm',now),/Choose/);
 for(const invalid of [null,{mode:'auto',kind:'storm',nextChangeAt:now},{mode:'manual',kind:'sunny',nextChangeAt:-1}]){
  const bad=H.clone(h);bad.weather=invalid;assert.throws(()=>H.HouseModel.validate(bad),/weather/);
 }
});
test('Appliances accept exact durations, reject invalid input, and release completed bookings',()=>{
 const h=strip(3),o=new H.ObjectSystem(h).place('oven',target(1,0),0,1.5),now=Date.now(),F=H.HouseFeatures;
 const r=F.reserve(o,'oven','self',now,43,{now});assert.equal(r.endAt-r.startAt,43*60000);
 for(const minutes of [0,1.5,1441,NaN])assert.throws(()=>F.reserve(o,'oven','self',now,minutes,{now}),/duration/);
 assert.throws(()=>F.reserve(o,'dryer','self',now,43,{now}),/appliance/);
 r.completedAt=now+1;F.reserve(o,'oven','alex',now+2,17,{now});H.HouseModel.validate(h);
});
test('Personal tasks filter identity, reorder urgent insertions and complete only the current assignee',()=>{
 const h=H.HouseModel.basic(),now=Date.now(),members=[{id:'self'},{id:'alex'}];h.animal.placed=false;
 const board=new H.ObjectSystem(h).place('board',target(2,0,'N','wall-n-2'),0,1.5);
 const later=H.HouseFeatures.addTask(board,'Shared',['self','alex'],now+600000,members,now);
 H.HouseFeatures.addTask(board,'Private',['alex'],now+100,members,now);
 const urgent=H.HouseFeatures.addTask(board,'Urgent',['self'],now+1000,members,now);
 let tasks=H.HouseTasks.forMember(h,'self',now);assert.deepEqual(tasks.map(t=>t.title),['Urgent','Shared']);
 assert.throws(()=>H.HouseTasks.complete(h,'alex',tasks[0].key,now),/no longer/);
 H.HouseTasks.complete(h,'self',tasks[1].key,now+1);assert.deepEqual(later.completedBy,['self']);assert.equal(later.completedAt,null);
 assert.deepEqual(H.HouseTasks.forMember(h,'self',now).map(t=>t.title),['Urgent']);
 const alexShared=H.HouseTasks.forMember(h,'alex',now).find(t=>t.title==='Shared');H.HouseTasks.complete(h,'alex',alexShared.key,now+2);assert.equal(later.completedAt,now+2);
 board.customState.tasks=board.customState.tasks.filter(t=>t.id!==urgent.id);assert.equal(H.HouseTasks.forMember(h,'self',now).length,0);H.HouseModel.validate(h);
});
test('Reservation tasks appear 30 minutes ahead and progress from start to collection',()=>{
 const h=strip(3),now=Date.now(),oven=new H.ObjectSystem(h).place('oven',target(1,0),0,1.5);new H.ObjectSystem(h).place('cat',target(0,0),0,1.5);
 const r=H.HouseFeatures.reserve(oven,'oven','self',now+31*60000,43,{now});
 assert.equal(H.HouseTasks.forMember(h,'self',now).length,0);let tasks=H.HouseTasks.forMember(h,'self',now+60000);assert.equal(tasks[0].phase,'start');
 H.HouseTasks.complete(h,'self',tasks[0].key,now+2*60000);assert.equal(H.HouseTasks.forMember(h,'self',now+3*60000).length,0);
 tasks=H.HouseTasks.forMember(h,'self',r.endAt-60000);assert.equal(tasks[0].phase,'finish');
 H.HouseTasks.complete(h,'self',tasks[0].key,r.endAt-1000);assert.equal(H.HouseTasks.forMember(h,'self',r.endAt).length,0);
 const missed=H.HouseFeatures.reserve(oven,'oven','self',now,2,{now});assert.equal(H.HouseTasks.forMember(h,'self',now+3*60000)[0].phase,'finish');
 assert.equal(H.HouseTasks.forMember(h,'alex',now).length,0);assert.ok(missed);H.HouseModel.validate(h);
});
test('Trash turns and accepted door requests participate in personal tasks and persist completion',()=>{
 const h=H.HouseModel.basic(),now=Date.now(),trash=h.objects.find(o=>o.objectType==='trash'),members=[{id:'self'},{id:'alex'}];
 trash.customState.schedule={order:['self','alex'],nextIndex:0,intervalHours:24,nextDueAt:now+100};
 const r=H.HouseFeatures.send(h,'Bring bread','alex',['self'],members,now,now+200);
 assert.equal(H.HouseTasks.forMember(h,'self',now).length,1);H.HouseFeatures.respond(h,r.id,'self','accepted',now+1);
 let tasks=H.HouseTasks.forMember(h,'self',now);assert.deepEqual(tasks.map(t=>t.kind),['trash','request']);
 for(const t of tasks)H.HouseTasks.complete(h,'self',t.key,now+5);
 assert.equal(H.HouseTasks.forMember(h,'self',now).length,0);assert.equal(H.HouseTasks.forMember(h,'alex',now)[0].kind,'trash');
 const restored=H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h));assert.equal(H.HouseTasks.forMember(restored,'self',now).length,0);
});

test('Moving preserves photos, object identity, plant history and tabletop children atomically',()=>{
 const h=H.HouseModel.basic(),os=new H.ObjectSystem(h);h.animal.placed=false;
 const table=h.objects.find(o=>o.objectType==='table'),plant=h.objects.find(o=>o.objectType==='plant');
 os.move(plant.id,{grid:{...table.grid},supportId:table.id,supportSlot:0},90,1.5);const before=H.clone(h.objects.find(o=>o.id===plant.id));
 os.move(table.id,target(5,4),90,1.5);assert.deepEqual(h.objects.find(o=>o.id===plant.id).grid,{x:5,y:0,z:4});assert.deepEqual(h.objects.find(o=>o.id===plant.id).customState,before.customState);
 const art=os.place('art',target(2,0,'N','wall-n-2'),0,1.5);art.customState.image='data:image/png;base64,YQ==';const id=art.id;
 os.move(id,target(4,0,'N','wall-n-4'),90,2);assert.equal(h.objects.find(o=>o.id===id).customState.image,art.customState.image);assert.equal(h.objects.find(o=>o.id===id).attachedWallId,'wall-n-4');
 const snapshot=H.clone(h);assert.throws(()=>os.move(id,target(3,0,'N','wall-n-3'),0,1.5),/doorway/);assert.deepEqual(h,snapshot);H.HouseModel.validate(h);
});
test('Busy appliances require queue; idle appliances require reservation, including oven',()=>{
 const now=Date.now();for(const type of ['laundry','oven']){const o=H.objectDefinition(type,{x:0,z:0});for(const key of H.HouseFeatures.machineKeys(o)){
 assert.throws(()=>H.HouseFeatures.reserve(o,key,'self',now,43,{queue:true,now}),/available/);
 const first=H.HouseFeatures.reserve(o,key,'self',now,43,{now});assert.equal(H.HouseFeatures.busy(o,key,now),true);
 assert.throws(()=>H.HouseFeatures.reserve(o,key,'alex',first.endAt+60000,43,{now}),/in use/);
 const next=H.HouseFeatures.reserve(o,key,'alex',now,17,{queue:true,now});assert.equal(next.startAt,first.endAt);
 assert.equal(H.HouseFeatures.busy(o,key,next.endAt),false);
 }}
});
test('Plant points settle offline penalties once per roommate, credit once and preserve complete history',()=>{
 const h=H.HouseModel.basic(),now=Date.now(),plant=h.objects.find(o=>o.objectType==='plant'),members=[{id:'self'},{id:'alex'}];plant.customState.growth.placedAt=now-10*3600000;
 const board=new H.ObjectSystem(h).place('board',target(2,0,'N','wall-n-2'),0,1.5);
 const task=H.HouseFeatures.addTask(board,'Shared chore',['self','alex'],now-4*3600000,members,now-5*3600000);
 assert.equal(H.HouseChores.settle(h,now-3600001),false);assert.equal(H.HouseChores.settle(h,now),true);assert.equal(plant.customState.growth.score,98);assert.equal(H.HouseChores.settle(h,now+1),false);
 const key=H.HouseTasks.forMember(h,'self',now)[0].key;H.HouseTasks.complete(h,'self',key,now);assert.equal(plant.customState.growth.score,99);assert.equal(H.HouseTasks.forMember(h,'alex',now).length,1);
 task.completedBy=[];H.HouseTasks.complete(h,'self',key,now+1);assert.equal(plant.customState.growth.score,99);H.HouseTasks.complete(h,'alex',key,now+2);assert.equal(plant.customState.growth.score,100);assert.equal(plant.customState.growth.history.length,4);
 const loaded=H.HouseModel.validate(JSON.parse(JSON.stringify(h)));assert.equal(H.HouseChores.settle(loaded,now+10*3600000),false);assert.deepEqual(loaded.objects.find(o=>o.id===plant.id).customState.growth,plant.customState.growth);
 loaded.objects.find(o=>o.id===plant.id).customState.growth.history[0].score=77;assert.throws(()=>H.HouseModel.validate(loaded),/score/);
});
test('Plants start at 100, cap gains, die at 0 and exclude events before placement',()=>{
 const h=H.HouseModel.basic(),p=h.objects.find(o=>o.objectType==='plant'),now=Date.now();p.customState.growth.placedAt=now;
 H.HouseChores.record(h,'self',{key:'old',title:'Old task'},-1,now-1);assert.equal(p.customState.growth.history.length,0);
 H.HouseChores.record(h,'self',{key:'first',title:'Completed'},1,now);assert.equal(p.customState.growth.score,100);assert.equal(p.customState.growth.history[0].change,0);
 for(let i=1;i<=100;i++)H.HouseChores.record(h,'self',{key:'t'+i,title:'Late task'},-1,now+i);
 assert.equal(p.customState.growth.score,0);assert.equal(p.customState.growth.deadAt,now+100);H.HouseChores.record(h,'self',{key:'after',title:'Complete'},1,now+101);assert.equal(p.customState.growth.score,0);H.HouseModel.validate(h);
});
test('Utility bills enter tasks and arrangement, recur on month-end and disappear with their source',()=>{
 const h=H.HouseModel.basic(),o=new H.ObjectSystem(h).place('water',target(2,0,'N','wall-n-2'),0,1.5),due=new Date(2026,0,31,10).getTime(),now=due-3600000;
 o.customState.bill={memberId:'self',dueAt:due,repeat:'monthly',anchorDay:31,note:'Pay water',paidAt:null};
 const task=H.HouseTasks.forMember(h,'self',now).find(t=>t.kind==='bill');assert.ok(task);assert.equal(H.HouseTasks.forMember(h,'alex',now).filter(t=>t.kind==='bill').length,0);
 H.HouseTasks.complete(h,'self',task.key,now);assert.equal(new Date(o.customState.bill.dueAt).getDate(),28);const next=H.HouseTasks.forMember(h,'self',now).find(t=>t.kind==='bill');H.HouseTasks.complete(h,'self',next.key,o.customState.bill.dueAt);assert.equal(new Date(o.customState.bill.dueAt).getDate(),31);
 assert.ok(H.HouseChores.arrangement(h,[{id:'self'}],now).some(t=>t.source==='Water bill'));new H.ObjectSystem(h).remove(o.id);assert.equal(H.HouseTasks.forMember(h,'self',now).filter(t=>t.kind==='bill').length,0);
});
test('Arrangement includes distant bookings and shared tasks once while cards remain personal',()=>{
 const h=H.HouseModel.basic(),now=Date.now(),members=[{id:'self'},{id:'alex'}],os=new H.ObjectSystem(h),oven=os.place('oven',target(4,4),0,1.5),board=os.place('board',target(2,0,'N','wall-n-2'),0,1.5);
 H.HouseFeatures.reserve(oven,'oven','alex',now+86400000,43,{now});H.HouseFeatures.addTask(board,'Both',['self','alex'],now+10000,members,now);
 const rows=H.HouseChores.arrangement(h,members,now);assert.equal(rows.filter(t=>t.title==='Both').length,1);assert.deepEqual(rows.find(t=>t.title==='Both').members,['self','alex']);assert.ok(rows.some(t=>t.kind==='booking'));assert.equal(rows.some(t=>t.kind==='care'),false);assert.equal(H.HouseTasks.forMember(h,'alex',now).filter(t=>t.kind==='booking').length,0);
});
test('Sky color changes at dawn, noon and dusk; lamps migrate and validate brightness',()=>{
 const f=H.HouseFeatures,auto={mode:'auto',level:1},colors=[0,6,12,18].map(h=>f.skyColor(auto,new Date(2026,9,4,h)));assert.equal(new Set(colors.map(c=>c.join(','))).size,4);assert.deepEqual(f.skyColor({mode:'manual',level:0}),[10,15,25]);
 const h=H.HouseModel.basic(),lamp=new H.ObjectSystem(h).place('lamp',target(2,0,'N','wall-n-2'),0,1.5);lamp.interactionType=null;assert.equal(H.HouseModel.validate(h).objects.find(o=>o.id===lamp.id).interactionType,'LAMP');lamp.interactionType='LAMP';lamp.customState.light={on:true,brightness:3};assert.throws(()=>H.HouseModel.validate(h),/lamp/);
});

test('At the exact three-hour boundary, overdue settles before completion even with the same timestamp',()=>{
 const h=H.HouseModel.basic(),now=Date.now(),plant=h.objects.find(o=>o.objectType==='plant'),members=[{id:'self'}];plant.customState.growth.placedAt=now-5*3600000;
 const board=new H.ObjectSystem(h).place('board',target(2,0,'N','wall-n-2'),0,1.5);H.HouseFeatures.addTask(board,'Boundary',['self'],now-3*3600000,members,now-4*3600000);
 H.HouseTasks.complete(h,'self',H.HouseTasks.forMember(h,'self',now)[0].key,now);assert.deepEqual(plant.customState.growth.history.map(e=>e.delta),[-1,1]);assert.equal(plant.customState.growth.score,100);H.HouseModel.validate(h);
});
test('Moving Pip preserves care and does not reset his life clock',()=>{
 const h=H.HouseModel.basic(),before=H.clone(h.animal),os=new H.ObjectSystem(h);os.move('pip',target(5,4),0,1.5);assert.deepEqual(h.animal,{...before,grid:{x:5,y:0,z:4}});
 assert.throws(()=>os.move('pip',target(1,1),0,1.5),/occupies/);assert.deepEqual(h.animal.grid,{x:5,y:0,z:4});assert.equal(H.HouseModel.validate(h).animal.lastFedAt,before.lastFedAt);
});

test('Latest default preserves the supplied layout and starts fresh care and appliance activity',()=>{
 const template=JSON.parse(fs.readFileSync(base+'presets/default-house.json','utf8')),now=Date.now(),h=H.HouseModel.defaultHouse(now);
 assert.deepEqual(H.DefaultHousePreset,template);assert.deepEqual(h.structure,template.structure);assert.deepEqual(h.materials,template.materials);assert.deepEqual(h.lighting,template.lighting);
 const placement=o=>[o.id,o.objectType,o.grid,o.rotation,o.height,o.attachedWallId,o.supportId,o.supportSlot];assert.deepEqual(h.objects.map(placement),template.objects.map(placement));
 assert.equal(h.animal.lastFedAt,now);assert.notEqual(h.animal.lifeId,template.animal.lifeId);assert.deepEqual(h.animal.grid,template.animal.grid);assert.equal(h.metadata.savedAt,null);
 const plant=h.objects.find(o=>o.objectType==='plant');assert.deepEqual(plant.customState.growth,{placedAt:now,score:100,deadAt:null,history:[]});for(const o of h.objects)for(const bookings of Object.values(o.customState.machines||{}))assert.deepEqual(bookings,[]);
 assert.deepEqual(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)),h);h.objects[0].rotation=270;assert.deepEqual(H.DefaultHousePreset,template);
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};const repo=new H.SaveSystem('new-preset');const loaded=repo.load();assert.deepEqual(loaded.house.structure,template.structure);assert.equal(loaded.house.objects.length,template.objects.length);
 repo.save(h);assert.equal(new H.SaveSystem('new-preset').load().house.objects[0].rotation,270);
});
test('Feed Pip appears only while hungry or horrible and disappears after eating or death',()=>{
 const h=H.HouseModel.basic(),fed=Date.now();h.animal.lastFedAt=fed;
 for(const [age,visible]of [[0,false],[6*3600000,false],[12*3600000-1,false],[12*3600000,true],[18*3600000,true],[24*3600000,false]])assert.equal(H.HouseChores.arrangement(h,[{id:'self'}],fed+age).some(t=>t.kind==='care'),visible);
 h.animal.lastFedAt=fed+18*3600000;assert.equal(H.HouseChores.arrangement(h,[{id:'self'}],fed+18*3600000).some(t=>t.kind==='care'),false);
 h.animal.placed=false;assert.equal(H.HouseChores.arrangement(h,[{id:'self'}],fed+31*3600000).some(t=>t.kind==='care'),false);
});
test('An early started appliance is busy and cannot be queued into its original start gap',()=>{
 const now=Date.now(),h=H.HouseModel.basic(),o=new H.ObjectSystem(h).place('oven',target(4,4),0,1.5);
 const reservation=H.HouseFeatures.reserve(o,'oven','self',now+20*60000,43,{now});assert.equal(H.HouseFeatures.busy(o,'oven',now),false);
 const task=H.HouseTasks.forMember(h,'self',now).find(t=>t.kind==='booking');H.HouseTasks.complete(h,'self',task.key,now);assert.equal(H.HouseFeatures.busy(o,'oven',now),true);
 assert.throws(()=>H.HouseFeatures.reserve(o,'oven','alex',reservation.endAt,5,{now}),/in use/);
 const queued=H.HouseFeatures.reserve(o,'oven','alex',now,5,{queue:true,now});assert.equal(queued.startAt,reservation.endAt);
});
test('A later booking cannot be started across someone else’s reserved interval',()=>{
 const now=Date.now(),h=H.HouseModel.basic(),o=new H.ObjectSystem(h).place('oven',target(4,4),0,1.5);
 H.HouseFeatures.reserve(o,'oven','alex',now+5*60000,5,{now});H.HouseFeatures.reserve(o,'oven','self',now+15*60000,5,{now});
 const task=H.HouseTasks.forMember(h,'self',now).find(t=>t.kind==='booking'),before=H.clone(h);assert.throws(()=>H.HouseTasks.complete(h,'self',task.key,now),/Wait for your turn/);assert.deepEqual(h,before);
});

test('Refrigerator validates positive whole quantities, sections and portable names',()=>{
 const h=strip(),o=new H.ObjectSystem(h).place('fridge',target(1,0),0,1.5);
 for(const q of [0,-1,.5,NaN,10000])assert.throws(()=>H.HouseFeatures.addInventory(o,'Milk','chilled',q),/quantity/);
 assert.throws(()=>H.HouseFeatures.addInventory(o,'','frozen',1),/name/);
 const milk=H.HouseFeatures.addInventory(o,'Milk','chilled',2),peas=H.HouseFeatures.addInventory(o,'Peas','frozen',1);
 assert.equal(H.HouseFeatures.changeInventory(o,milk.id,-1),true);assert.equal(milk.quantity,1);
 assert.equal(H.HouseFeatures.changeInventory(o,milk.id,-1),false,'last unit signals the depletion flow');
 H.HouseFeatures.changeInventory(o,peas.id,1);assert.equal(peas.quantity,2);
 assert.deepEqual(H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)).objects[0].customState.inventory,o.customState.inventory);
 assert.equal(milk.quantity,0);assert.throws(()=>H.HouseFeatures.changeInventory(o,milk.id,-1),/out of stock/);H.HouseFeatures.changeInventory(o,milk.id,1);assert.equal(milk.quantity,1);milk.quantity=-1;assert.throws(()=>H.HouseModel.validate(h),/Inventory/);
});
test('Cleaning rotations isolate assignments, score completion and advance their deadline once',()=>{
 const h=H.HouseModel.basic(),o=new H.ObjectSystem(h).place('vacuum',target(2,3),0,1.5),now=Date.now();
 o.customState.schedule={order:['alex','self'],nextIndex:0,nextDueAt:now+1000,intervalHours:24};
 assert.equal(H.HouseTasks.forMember(h,'self',now).length,0);
 const task=H.HouseTasks.forMember(h,'alex',now)[0];assert.equal(task.title,'Clean the house');assert.equal(task.source,'Vacuum cleaner');
 assert.throws(()=>H.HouseTasks.complete(h,'self',task.key,now));
 const due=task.dueAt;H.HouseChores.settle(h,due+3*3600000);H.HouseChores.settle(h,due+3*3600000);
 const plant=h.objects.find(o=>o.objectType==='plant');assert.equal(plant.customState.growth.history.length,1);
 H.HouseTasks.complete(h,'alex',task.key,due+3*3600000+1);assert.equal(plant.customState.growth.history.length,2);assert.equal(o.customState.schedule.nextIndex,1);
 assert.equal(H.HouseTasks.forMember(h,'self',due+3*3600000+1)[0].title,'Clean the house');
 assert.equal(H.HouseChores.arrangement(h,[{id:'self'},{id:'alex'}],now).filter(t=>t.objectId===o.id).length,1);
 new H.ObjectSystem(h).remove(o.id);assert.equal(H.HouseTasks.forMember(h,'self',now).length,0);H.HouseModel.validate(h);
});
test('Long tables use two floor cells and eight persistent tabletop slots through move/rotate/delete',()=>{
 const h=H.HouseModel.basic();h.objects=[];h.animal.placed=false;
 const sys=new H.ObjectSystem(h),table=sys.place('longtable',target(1,1),0,1.5);
 assert.equal(G.footprint(table).length,2);assert.throws(()=>sys.place('table',target(2,1),0,1.5),/occupies/);
 const children=[];for(let slot=0;slot<8;slot++)children.push(sys.place('speaker',{...target(1,1),supportId:table.id,supportSlot:slot},0,1.5));
 assert.throws(()=>sys.place('plant',{...target(1,1),supportId:table.id,supportSlot:8},0,1.5),/tabletop/);
 sys.rotate(table.id);assert.deepEqual(G.footprint(table),[{x:1,y:0,z:1},{x:1,y:0,z:2}]);
 sys.move(table.id,target(3,2),90,1.5);assert.ok(children.every(c=>c.grid.x===3&&c.grid.z===2));H.HouseModel.validate(h);
 assert.throws(()=>sys.move(table.id,target(5,4),90,1.5),/floor/);sys.remove(table.id);assert.equal(h.objects.length,0);
});
test('Ten-minute cat absence persists, cannot be dismissed, clears only with placement and starts again on removal',()=>{
 const h=strip(),now=Date.now(),sys=new H.ObjectSystem(h);h.animal.absentSince=now;
 assert.equal(H.HouseTasks.forMember(h,'self',now+599999).length,0);
 const task=H.HouseTasks.forMember(h,'self',now+600000)[0];assert.equal(task.kind,'cat-missing');
 assert.equal(H.HouseTasks.forMember(h,'alex',now+600000)[0].key,task.key);
 assert.throws(()=>H.HouseTasks.complete(h,'self',task.key,now+600000),/Place Pip/);
 const restored=H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h));assert.equal(H.HouseTasks.forMember(restored,'self',now+900000)[0].key,task.key);
 sys.place('cat',target(0,0),0,1.5);assert.equal(h.animal.absentSince,null);assert.equal(H.HouseTasks.forMember(h,'self',now+900000).length,0);
 sys.remove('pip');assert.ok(Number.isSafeInteger(h.animal.absentSince));assert.equal(H.HouseTasks.forMember(h,'self',h.animal.absentSince+599999).length,0);
});
test('Offline cat expiry starts absence at expiry, while missing-cat reminders do not change chore points',()=>{
 const h=H.HouseModel.basic(),now=Date.now();h.animal.lastFedAt=now-25*3600000;
 new H.AnimalSystem(h).checkVitals(now);assert.equal(h.animal.absentSince,h.animal.lastFedAt+24*3600000);
 const task=H.HouseTasks.forMember(h,'self',now)[0];assert.equal(task.kind,'cat-missing');
 assert.equal(H.HouseChores.record(h,'self',task,-1,now),false);assert.equal(h.objects.find(o=>o.objectType==='plant').customState.growth.score,100);
});
test('Custom objects preserve variable dimensions and identity, but reject height over three and missing export assets',()=>{
 const h=strip(5),sys=new H.ObjectSystem(h),custom={size:{x:2,y:3,z:1},model:{id:'model-test',name:'Test.glb',bytes:100}};
 const o=sys.place('custom',target(1,0),0,1.5,custom);H.HouseModel.validate(h);
 sys.move(o.id,target(3,0),0,1.5);const moved=h.objects.find(x=>x.id===o.id);assert.deepEqual(moved.size,custom.size);assert.deepEqual(moved.customState.model,custom.model);
 assert.throws(()=>sys.rotate(o.id),/floor/);moved.size.y=3.1;assert.throws(()=>H.HouseModel.validate(h),/size/);moved.size.y=3;
 assert.throws(()=>H.ImportExportSystem.parse(H.ImportExportSystem.serialize(h)),/missing.*models/);
});
