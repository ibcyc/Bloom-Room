/* Room presentation, care persistence, and navigation integration in an isolated browser. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 const base=process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767';
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.addInitScript(()=>{if(!localStorage.getItem('roombloom-demo-v1'))localStorage.setItem('roombloom-demo-v1',JSON.stringify({version:1,loggedIn:true,user:{name:'Test',campus:'',habits:null},rooms:[{id:'test',name:'Maple House',code:'TEST',members:[{id:'self',name:'Test',color:'sage'},{id:'sam',name:'Sam',color:'peach'},{id:'alex',name:'Alex',color:'blue'}]}],connections:{},invitations:[],lastRoom:'test'}));});
  await page.route('**/house/editor.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../house/editor.js'),'utf8')+'\nconst originalMount=RoomBloomHouse.mount;RoomBloomHouse.mount=(...args)=>(window.editor=originalMount(...args));'}));
  const action=name=>page.locator('[data-h-action="'+name+'"]');
  const mounted=async()=>{await page.waitForFunction(()=>window.editor&&!editor.disposed&&!!editor.scene);};
  const layout=async()=>{
   const stage=await page.locator('#house-stage').boundingBox(),view=page.viewportSize();
   assert.deepEqual(stage,{x:0,y:0,width:view.width,height:view.height});
   const identity=await page.locator('.house-identity').boundingBox(),rail=await page.locator('.house-residents').boundingBox();
   assert.ok(Math.abs(identity.x+identity.width/2-view.width/2)<1);assert.ok(Math.abs(rail.y+rail.height/2-view.height/2)<1);
   const gear=await action('edit').boundingBox(),help=await action('help').boundingBox();
   assert.equal(gear.x,help.x);assert.ok(gear.y>view.height-80);assert.ok(help.y<50);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  };
  await page.goto(base+'/');await mounted();assert.match(page.url(),/#\/room\/test$/);await layout();
  assert.equal(await page.locator('.house-resident').count(),4);assert.equal(await page.locator('.room-tabs,.house-side,[data-h-action="animal-go"]').count(),0);
  assert.equal(await action('frame').locator('svg').count(),1);assert.equal(await action('help').locator('svg').count(),1);
  await page.mouse.move(400,100);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.house-settings')).opacity==='0.4');
  await action('edit').hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.house-settings')).opacity==='1');
  await page.mouse.move(400,100);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-room-desktop.png')});
  console.log('PASS centered full-screen room, corner icons, quiet controls, centered avatars, and remembered entry');
  await page.evaluate(()=>{editor.house=RoomBloomHouse.HouseModel.basic();editor.refresh();editor.persistRuntime();});
  await page.waitForFunction(()=>!editor.house.objects.some(o=>o.objectType==='bowl'),{},{timeout:15000});
  const firstMeal=await page.evaluate(()=>editor.house.animal.lastFedAt);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('roombloom-house-v1:test')).animal.lastFedAt),firstMeal);
  await action('pet-status').click();assert.equal(await page.locator('[data-pet-hunger]').innerText(),'full');assert.equal(await page.locator('#house-pet-health').getAttribute('max'),'100');assert.equal(await page.locator('#house-pet-health').evaluate(el=>el.value),100);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#house-pet-panel').isVisible(),false);
  // A furniture click targets that actual instance, then the renderer uses its resting elevation.
  const clickObject=async(type)=>{
   const point=await page.evaluate(type=>{const o=editor.house.objects.find(o=>o.objectType===type),s=editor.scene,r=s.canvas.getBoundingClientRect(),p=new THREE.Vector3(o.grid.x+.5,.45,o.grid.z+.5).project(s.camera);return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2,id:o.id};},type);
   await page.mouse.click(point.x,point.y);return point.id;
  };
  const bedId=await clickObject('bed');await page.waitForFunction(id=>editor.animal.goal===id&&editor.animal.state==='Sleeping',bedId,{timeout:15000});
  assert.equal(await page.evaluate(()=>editor.scene.animalMesh.position.y),.42);
  await page.mouse.move(400,100);
  await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cat-bed.png')});
  const sofaId=await clickObject('sofa');await page.waitForFunction(id=>editor.animal.goal===id&&editor.animal.state==='Sitting',sofaId,{timeout:15000});
  assert.equal(await page.evaluate(()=>editor.scene.animalMesh.position.y),.47);
  assert.equal(await action('door-lock').count(),0);assert.equal(await page.evaluate(()=>editor.scene.entries.get('door-entry').root.userData.hinge.rotation.y),0);
  console.log('PASS automatic feeding persists at completion; exact clicked bed/sofa supports Pip; door stays closed');
  await action('edit').click();
  await page.evaluate(()=>{
   const H=RoomBloomHouse;editor.house=H.HouseModel.basic();editor.house.objects=editor.house.objects.filter(o=>o.objectType!=='bowl');editor.house.animal.lastFedAt=Date.now()-12*3600000;editor.undoStack=[];editor.redoStack=[];editor.refresh();
   editor.mutate(()=>editor.objects.place('bowl',{grid:{x:3,y:0,z:2}},0,1.5),'Food placed.');
  });
  await page.waitForFunction(()=>!editor.house.objects.some(o=>o.objectType==='bowl'),{},{timeout:10000});
  const fed=await page.evaluate(()=>editor.house.animal.lastFedAt);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('roombloom-house-v1:test:draft')).animal.lastFedAt),fed);
  await page.locator('#house-stage canvas').focus();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>editor.house.animal.lastFedAt),fed);
  await page.keyboard.press('Control+Shift+z');assert.equal(await page.evaluate(()=>editor.house.objects.some(o=>o.objectType==='bowl')),false);
  await action('save').click();await page.reload();await mounted();assert.equal(await page.evaluate(()=>editor.house.animal.lastFedAt),fed);
  console.log('PASS food placed during editing is eaten and care survives draft, undo/redo, Save and reload');
  await action('pet-status').click();
  for(const [hours,label] of [[6,'ok'],[12,'hungry'],[18,'horrible']]){
   await page.evaluate(hours=>{editor.house.animal.lastFedAt=Date.now()-hours*3600000-1000;editor.updateLife();editor.persistRuntime();},hours);
   assert.equal(await page.locator('[data-pet-hunger]').innerText(),label);
  }
  assert.equal(await page.locator('[data-pet-countdown]').isVisible(),true);assert.match(await page.locator('[data-pet-countdown]').innerText(),/05:59:/);
  await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-pet-status.png')});
  await page.locator('[aria-label="Leave room"]').click();await page.waitForURL('**/#/homes');await page.locator('.house-shell').waitFor({state:'detached'});
  await page.evaluate(()=>{const key='roombloom-house-v1:test',h=JSON.parse(localStorage.getItem(key));h.animal.lastFedAt=Date.now()-24*3600000;localStorage.setItem(key,JSON.stringify(h));});
  await page.goto(base+'/');await mounted();assert.equal(await page.evaluate(()=>editor.house.animal.placed),false);assert.equal(await page.evaluate(()=>editor.scene.animalMesh.visible),false);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('roombloom-house-v1:test')).animal.placed),false);
  await action('pet-status').click();assert.equal(await page.locator('[data-pet-absent]').isVisible(),true);await action('close-pet').click();
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#house-stage canvas').clientWidth===390);await layout();
  await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-room-mobile.png')});
  await action('pet-status').click();const panel=await page.locator('#house-pet-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390);
  console.log('PASS care stages, final countdown, offline expiry, return-to-room persistence and mobile layout');
  assert.deepEqual(errors,[]);console.log('PASS no browser errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
