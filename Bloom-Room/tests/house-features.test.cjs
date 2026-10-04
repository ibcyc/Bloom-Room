/* Real UI coverage for furniture interactions, local inboxes, media and portable exports. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>{if(!localStorage.getItem('roombloom-demo-v1'))localStorage.setItem('roombloom-demo-v1',JSON.stringify({version:1,loggedIn:true,user:{name:'Test'},rooms:[{id:'test',name:'Test house',code:'TEST',members:[{id:'self',name:'Test'},{id:'alex',name:'Alex'},{id:'sam',name:'Sam'}]}],connections:{},invitations:[]}));});
  await page.route('**/house/editor.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../house/editor.js'),'utf8')+'\nconst originalMount=RoomBloomHouse.mount;RoomBloomHouse.mount=(...args)=>(window.editor=originalMount(...args));'}));
  await page.goto((process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767')+'/#/room/test');await page.waitForFunction(()=>window.editor?.scene);
  const act=(name)=>page.locator('[data-h-action="'+name+'"]'),close=()=>act('close-dialog').click();
  const object=type=>page.evaluate(type=>editor.house.objects.find(o=>o.objectType===type),type);
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const point=async(x,z,y=.025)=>{await settle();return page.evaluate(({x,y,z})=>{const s=editor.scene,p=new THREE.Vector3(x,y,z).project(s.camera),r=s.canvas.getBoundingClientRect();return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};},{x,y,z});};
  const click=async(x,z,y=.025,button='left')=>{const p=await point(x,z,y);await page.mouse.click(p.x,p.y,{button});};
  const open=async(type)=>{
   await settle();
   const p=await page.evaluate(type=>{const o=editor.house.objects.find(o=>o.objectType===type),e=editor.scene.entries.get(o.id),v=e.root.position.clone();if(o.placement==='FLOOR')v.y+=o.objectType==='laundry'?1.1:o.objectType==='speaker'?.3:.4;const s=editor.scene,r=s.canvas.getBoundingClientRect();v.project(s.camera);return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2,id:o.id};},type);
   assert.equal(await page.evaluate(p=>editor.scene.hit(p.x,p.y)?.entity?.id,p),p.id,'raycast reaches '+type);
   await page.mouse.click(p.x,p.y);
  };
  const choose=async(type)=>{await act('catalog').click();await page.locator('[data-h-action="choose-object"][data-id="'+type+'"]').click();};
  await page.evaluate(()=>{
   editor.mutate(()=>{const H=RoomBloomHouse,h=H.HouseModel.basic();h.animal.placed=false;h.objects=h.objects.filter(o=>o.objectType!=='bowl');const os=new H.ObjectSystem(h);
    for(const [type,x,z] of [['laundry',5,0],['speaker',2,3]])os.place(type,{grid:{x,y:0,z}},0,1.5);
    os.place('board',{grid:{x:0,y:0,z:1},wallId:'wall-w-1'},0,1.5);editor.house=h;
   },'Fixture');editor.save();
  });
  await act('edit').click();await page.locator('[data-key="layer"][data-value="OBJECT"]').click();
  await choose('plant');await click(3.69,3.69,.74);let supported=await page.evaluate(()=>editor.house.objects.find(o=>o.supportId));assert.equal(supported.objectType,'plant');
  assert.equal(await page.evaluate(id=>editor.scene.entries.get(id).root.position.y,supported.id),.73);
  await choose('bowl');await click(3.31,3.31,.74);assert.equal(await page.evaluate(()=>editor.house.objects.some(o=>o.objectType==='bowl')),false);assert.match(await page.locator('#house-message').innerText(),/floor/i);await page.keyboard.press('Escape');
  // A table's empty corner remains selectable and removes its supported items as one edit.
  await click(3.15,3.85,.74,'right');assert.equal(await object('table'),undefined);assert.equal(await page.evaluate(()=>editor.house.objects.some(o=>o.supportId)),false);
  await page.keyboard.press('Control+z');assert.ok(await object('table'));assert.equal(await page.evaluate(()=>editor.house.objects.filter(o=>o.supportId).length),1);
  console.log('PASS tabletop placement, floor-only bowls, table cascade and undo');
  await choose('art');await page.locator('#house-art-file').setInputFiles({name:'picture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP438AARAwMDf+BCAAp8gX9AiY2+QAAAABJRU5ErkJggg==','base64')});
  await page.waitForFunction(()=>!editor.ui.modal.open&&editor.state.artImage);await click(2.5,.02,1.5);assert.match((await object('art')).customState.image,/^data:image/);await act('save').click();
  await open('art');assert.equal(await page.locator('.house-art-preview img').count(),1);assert.equal(await page.locator('#house-art-file').isVisible(),false);await act('close-art').click();
  assert.ok(await page.evaluate(()=>{const o=editor.house.objects.find(o=>o.objectType==='art'),picture=editor.scene.entries.get(o.id).root.userData.picture;return Math.abs(.42*picture.scale.x/(.34*picture.scale.y)-1)<.001;}),'square artwork keeps its proportions inside the rectangular frame');
  await page.evaluate(()=>{const h=editor.house,o=h.objects.find(o=>o.objectType==='art');editor.interactions.artSetup(o.id);});
  await page.locator('#house-art-file').setInputFiles({name:'picture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP438AARAwMDf+BCAAp8gX9AiY2+QAAAABJRU5ErkJggg==','base64')});
  await page.waitForFunction(()=>document.querySelector('#house-modal-error').textContent.includes('already'));await close();
  console.log('PASS upload during placement, immutable image and explicit-close artwork popup');
  await open('trash');await page.locator('[name="turn0"]').selectOption('sam');await page.locator('[name="turn2"]').selectOption('self');await page.locator('[name="interval"]').fill('2');await page.locator('[name="unit"]').selectOption('days');await page.getByRole('button',{name:'Save rotation'}).click();
  let schedule=(await object('trash')).customState.schedule;assert.deepEqual(schedule.order,['sam','alex','self']);assert.equal(schedule.intervalHours,48);assert.equal(await act('trash-done').isDisabled(),true);await page.locator('[name="turn0"]').selectOption('self');await page.locator('[name="turn2"]').selectOption('sam');await page.getByRole('button',{name:'Save rotation'}).click();await act('trash-done').click();schedule=(await object('trash')).customState.schedule;assert.equal(schedule.nextIndex,1);assert.ok(Math.abs(schedule.nextDueAt-Date.now()-48*3600000)<30000);await close();
  console.log('PASS trash order, custom interval, due time and turn progression');
  await open('laundry');assert.deepEqual(await page.locator('.house-machine h3').allTextContents(),['Dryer · upper','Washer · lower']);
  const washer=page.locator('.house-machine').nth(1),dryer=page.locator('.house-machine').nth(0);
  await page.evaluate(()=>{window.testNow=Date.now();Date.now=()=>window.testNow;});const start=await page.evaluate(()=>{const d=new Date(Date.now());return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);});await washer.locator('[name="start"]').fill(start);await washer.locator('[name="booking"][value="reserve"]').click();let machines=(await object('laundry')).customState.machines;assert.equal(machines.washer.length,1);
  assert.equal(await washer.locator('[name="booking"][value="reserve"]').isDisabled(),true);
  await washer.locator('[name="memberId"]').selectOption('alex');await washer.locator('[name="booking"][value="queue"]').click();machines=(await object('laundry')).customState.machines;assert.equal(machines.washer.length,2);assert.equal(machines.washer[1].startAt,machines.washer[0].endAt);
  await dryer.locator('[name="booking"][value="reserve"]').click();machines=(await object('laundry')).customState.machines;assert.equal(machines.dryer.length,1);assert.ok(machines.dryer[0].startAt<machines.washer[0].endAt);
  await washer.locator('[data-h-action="laundry-cancel"]').first().click();assert.equal((await object('laundry')).customState.machines.washer.length,1);await close();
  console.log('PASS washer/dryer independent bookings, collision rejection, queues and cancellation');
  await open('board');await page.locator('[name="text"]').fill('Buy milk <test>');await page.locator('[name="assignee:alex"]').check();await page.getByRole('button',{name:'Add task',exact:true}).click();
  let task=(await object('board')).customState.tasks[0];assert.deepEqual(task.assignees,['self','alex']);assert.equal(await page.locator('#house-dialog test').count(),0);assert.ok(task.dueAt>Date.now());
  await act('task-toggle').click();assert.ok((await object('board')).customState.tasks[0].completedBy.includes('self'));assert.equal((await object('board')).customState.tasks[0].completedAt,null);await act('task-toggle').click();assert.equal((await object('board')).customState.tasks[0].completedAt,null);await close();
  await click(3.5,.05,1.2);await page.locator('[name="public"]').check();await page.getByRole('button',{name:'Save visibility'}).click();assert.equal(await page.evaluate(()=>editor.house.social.isPublic),true);
  await page.locator('[name="text"]').fill('Please buy milk');await page.getByRole('button',{name:'Send to local inboxes'}).click();await close();
  await page.locator('.is-self').hover();assert.equal(await page.locator('[data-h-action="member"][data-id="alex"] .house-inbox-count').innerText(),'1');
  await page.locator('.is-self').hover();await page.locator('[data-h-action="member"][data-id="alex"]').click();await page.locator('[data-h-action="request-respond"][data-value="accepted"]').click();await close();
  await page.locator('.is-self').hover();await page.locator('[data-h-action="member"][data-id="sam"]').click();await page.locator('[data-h-action="request-respond"][data-value="declined"]').click();await close();
  assert.deepEqual(await page.evaluate(()=>editor.house.social.requests[0].recipients.map(r=>r.response)),['accepted','declined']);assert.equal(await page.locator('[data-id="alex"] .house-inbox-count').isVisible(),false);
  console.log('PASS wall tasks, multiple assignees, deadlines, public preference and local Accept/Decline inboxes');
  await open('speaker');await page.waitForFunction(()=>editor.sound.audio.currentTime>0);assert.equal(await act('music-toggle').innerText(),'Pause music');await act('music-toggle').click();assert.equal(await page.evaluate(()=>editor.sound.audio.paused),true);
  await page.locator('#house-audio-files').setInputFiles([{name:'Custom A.wav',mimeType:'audio/wav',buffer:fs.readFileSync(path.join(__dirname,'../house/audio/quiet-room.wav'))},{name:'Custom B.wav',mimeType:'audio/wav',buffer:fs.readFileSync(path.join(__dirname,'../house/audio/quiet-room.wav'))}]);
  await page.waitForFunction(()=>editor.house.objects.find(o=>o.objectType==='speaker').customState.music?.tracks.length===2);
  await act('music-up').last().click();assert.equal((await object('speaker')).customState.music.tracks[0].name,'Custom B.wav');
  await page.locator('[name="loop"]').selectOption('track');await page.locator('[data-h-action="music-track"][data-value="3"]').click();await page.waitForFunction(()=>editor.sound.index===3&&!editor.sound.audio.paused);
  await page.evaluate(()=>editor.sound.audio.dispatchEvent(new Event('ended')));await page.waitForFunction(()=>editor.sound.index===3&&!editor.sound.audio.paused);
  await page.locator('[name="loop"]').selectOption('playlist');await page.evaluate(()=>editor.sound.audio.dispatchEvent(new Event('ended')));await page.waitForFunction(()=>editor.sound.index===4&&!editor.sound.audio.paused);
  const active=await page.evaluate(()=>editor.sound.trackId);await page.locator('[data-h-action="music-remove"][data-id="'+active+'"]').click();assert.notEqual(await page.evaluate(()=>editor.sound.trackId),active);await close();
  console.log('PASS preset music, custom uploads, playlist order, both loop modes and stopping removed audio');
  const before=await object('speaker');await act('edit').click();await act('save').hover();await act('export').click();await page.locator('.house-json-preview').waitFor();const json=await page.locator('.house-json-preview').inputValue();const packed=JSON.parse(json);assert.equal(Object.keys(packed.assets).length,1);assert.ok(packed.assets[before.customState.music.tracks[0].id].data.length>1000);await close();
  await act('save').hover();await act('import').click();await page.locator('#house-import-file').setInputFiles({name:'house.json',mimeType:'application/json',buffer:Buffer.from(json)});await act('confirm-import').click();await page.waitForFunction(()=>!editor.ui.modal.open);const after=await object('speaker');assert.notEqual(after.customState.music.tracks[0].id,before.customState.music.tracks[0].id);assert.equal(await page.evaluate(()=>editor.house.assets),undefined);await act('save').click();
  await page.reload();await page.waitForFunction(()=>window.editor?.scene);assert.equal((await object('board')).customState.tasks.length,1);assert.equal(await page.evaluate(()=>editor.house.social.requests[0].recipients[0].response),'accepted');
  await open('speaker');await page.locator('[data-h-action="music-track"][data-value="3"]').click();await page.waitForFunction(()=>editor.sound.audio.currentTime>0);await close();
  await page.setViewportSize({width:390,height:844});await act('frame').click();await open('laundry');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#house-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);const fields=await page.locator('.house-inline-fields').first().locator('label').evaluateAll(els=>els.map(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom})));assert.ok(fields[1].top>=fields[0].bottom,'mobile start time and duration never overlap');await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-laundry-mobile.png')});await close();
  assert.deepEqual(errors,[]);console.log('PASS bundled audio export/import, media after reload, interaction persistence and mobile dialogs');
 }catch(e){await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-features-failure.png')});console.error(await page.locator('#house-dialog').innerText());throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
