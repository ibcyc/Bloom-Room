/* Reset only this demo's runtime storage, including a second tab with an unsaved room. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],dialogs=[];
 const base=process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767';
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/house/editor.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../house/editor.js'),'utf8')+'\nconst originalMount=RoomBloomHouse.mount;RoomBloomHouse.mount=(...args)=>(window.editor=originalMount(...args));'}));
 const seed=async()=>page.evaluate(async()=>{
  const h=RoomBloomHouse.HouseModel.defaultHouse();
  localStorage.setItem('roombloom-demo-v1',JSON.stringify({version:1,loggedIn:true,user:{name:'Demo owner',habits:{sleep:'Night owl'}},rooms:[{id:'reset-test',name:'Saved home',code:'RESET',members:[{id:'self'}]}],connections:{alex:'accepted'},invitations:[],archives:[{id:'old-home',name:'Old home',members:[],archivedAt:Date.now()}],lastRoom:'reset-test'}));
  localStorage.setItem('roombloom-house-v1:reset-test',JSON.stringify(h));
  localStorage.setItem('roombloom-house-v1:old-home:draft',JSON.stringify(h));
  for(const key of ['roombloom-task-alerts-v1:reset-test:self','roombloom-autoplay-v1:reset-test','roombloom-pip-mute-v1:reset-test:self','roombloom-pip-volume-v1:reset-test:self','roombloom-editor-preferences-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('roombloom-mood-v1','woodland');sessionStorage.setItem('roombloom-intro-seen','yes');
  localStorage.setItem('unrelated-app','leave me');localStorage.setItem('roombloom-not-a-runtime-key','keep');sessionStorage.setItem('unrelated-session','keep');
  await RoomBloomHouse.MediaStore.put('test-upload',new Blob(['demo audio'],{type:'audio/mpeg'}));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('unrelated-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>{const db=r.result,tx=db.transaction('files','readwrite');tx.objectStore('files').put('untouched','test');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};r.onerror=reject;});
 });
 try{
  await page.goto(base);await page.locator('[data-action="skip-intro"]').click();await seed();await page.goto(base+'/#/profile');await page.reload();
  assert.equal(await page.locator('[data-action="reset-demo"]').count(),1);
  const saved=await page.evaluate(()=>localStorage.getItem('roombloom-demo-v1'));
  // A failed media transaction must not claim success or clear rooms first.
  await page.evaluate(()=>{RoomBloomHouse.MediaStore.originalClear=RoomBloomHouse.MediaStore.clear;RoomBloomHouse.MediaStore.clear=async()=>{throw new Error('Test storage failure');};});
  await page.locator('[data-action="reset-demo"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('could not finish'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('roombloom-demo-v1')),saved);
  assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  assert.equal(await page.evaluate(async()=>!!await RoomBloomHouse.MediaStore.get('test-upload')),true);
  await page.evaluate(()=>{RoomBloomHouse.MediaStore.clear=RoomBloomHouse.MediaStore.originalClear;});
  console.log('PASS reset failure preserves rooms and uploads, reports failure and leaves controls usable');

  const other=await context.newPage();other.on('dialog',async d=>{dialogs.push(d.type());await d.dismiss();});
  await other.goto(base+'/#/room/reset-test');await other.waitForFunction(()=>window.editor?.scene);
  await other.locator('[data-h-action="edit"]').click();
  await other.evaluate(()=>{editor.mutate(()=>{editor.house.metadata.name='Unsaved demo';},'Draft');sessionStorage.setItem('roombloom-intro-seen','yes');});
  assert.equal(await other.evaluate(()=>editor.dirty),true);
  await page.locator('[data-action="reset-demo"]').click();
  await Promise.all([page.waitForSelector('.welcome-stage.intro-playing'),other.waitForSelector('.welcome-stage.intro-playing')]);
  assert.equal(await page.locator('#name').inputValue(),'');assert.equal(await other.locator('#name').inputValue(),'');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.mood),'macaron');
  const remaining=await page.evaluate(()=>Object.keys(localStorage).filter(k=>RoomBloomHouse.DemoReset.owns(k)));
  assert.deepEqual(remaining,['roombloom-mood-v1']);assert.equal(await other.evaluate(()=>!!window.editor),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-app')),'leave me');
  assert.equal(await page.evaluate(()=>localStorage.getItem('roombloom-not-a-runtime-key')),'keep');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('unrelated-session')),'keep');
  assert.equal(await page.evaluate(async()=>await RoomBloomHouse.MediaStore.get('test-upload')),undefined);
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('unrelated-media',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').get('test');q.onsuccess=()=>{db.close();resolve(q.result);};};})),'untouched');
  assert.deepEqual(dialogs,[]);console.log('PASS one-click reset clears scoped data/uploads, replays intro, preserves other storage and stops dirty tabs without restoring their drafts');

  await other.close();await page.locator('[data-action="skip-intro"]').click();await page.locator('#name').fill('Fresh demo');await page.locator('#login-form button').click();await page.waitForSelector('.welcome-choices');
  await page.goto(base+'/#/create');await page.locator('#roomName').fill('After reset');await page.locator('#create-form button').click();await page.waitForFunction(()=>window.editor?.scene);
  const geometry=await page.evaluate(()=>({floors:editor.house.structure,objects:editor.house.objects.map(o=>[o.objectType,o.grid,o.rotation])}));
  const expected=await page.evaluate(()=>{const h=RoomBloomHouse.HouseModel.defaultHouse();return {floors:h.structure,objects:h.objects.map(o=>[o.objectType,o.grid,o.rotation])};});
  assert.deepEqual(geometry,expected);
  await page.locator('[data-h-action="edit"]').click();await page.locator('[data-h-action="save"]').click();await page.reload();await page.waitForFunction(()=>window.editor?.scene);
  assert.equal(await page.locator('.house-identity').innerText(),'After reset');assert.deepEqual(errors,[]);
  console.log('PASS fresh login/create/editor/save/reload after reset uses the unchanged default house with no runtime errors');
 }catch(error){await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-reset-failure.png')});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
