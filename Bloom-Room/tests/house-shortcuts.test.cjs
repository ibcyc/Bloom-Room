/* IME key payloads must not disable physical editing keys or hijack text entry. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>localStorage.setItem('roombloom-demo-v1',JSON.stringify({version:1,loggedIn:true,user:{name:'Test'},rooms:[{id:'ime',name:'Keyboard test',code:'IME',members:[{id:'self'}]}],connections:{},invitations:[]})));
  await page.route('**/house/editor.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../house/editor.js'),'utf8')+'\nconst mountHouse=RoomBloomHouse.mount;RoomBloomHouse.mount=(...args)=>(window.editor=mountHouse(...args));'}));
  await page.goto((process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767')+'/#/room/ime');await page.waitForFunction(()=>window.editor?.scene);
  await page.locator('[data-h-action="edit"]').click();await page.locator('[data-key="layer"][data-value="OBJECT"]').click();await page.locator('[data-h-action="catalog"]').click();await page.locator('[data-h-action="choose-object"][data-id="sofa"]').click();
  const key=async(code,key='Process',extra={})=>page.evaluate(({code,key,extra})=>{const event=new KeyboardEvent('keydown',{code,key,bubbles:true,cancelable:true,isComposing:true,keyCode:229,...extra});document.activeElement.dispatchEvent(event);return event.defaultPrevented;},{code,key,extra});
  await page.keyboard.press('r');assert.equal(await page.evaluate(()=>editor.state.rotation),90);
  assert.equal(await key('KeyR'),true,'IME R should be handled on the canvas');assert.equal(await page.evaluate(()=>editor.state.rotation),180);
  await key('KeyR','ㄐ',{isComposing:false});assert.equal(await page.evaluate(()=>editor.state.rotation),270);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{editor.state.selected={kind:'object',id:editor.house.objects.find(o=>o.objectType==='sofa').id};editor.render();editor.scene.canvas.focus();});
  const initialRotation=await page.evaluate(()=>editor.house.objects.find(o=>o.objectType==='sofa').rotation);await key('KeyR');assert.equal(await page.evaluate(()=>editor.house.objects.find(o=>o.objectType==='sofa').rotation),(initialRotation+90)%360);
  await key('KeyM','ㄩ');assert.equal(await page.evaluate(()=>editor.state.movingId),await page.evaluate(()=>editor.house.objects.find(o=>o.objectType==='sofa').id));await page.keyboard.press('Escape');
  await page.keyboard.press('m');assert.ok(await page.evaluate(()=>editor.state.movingId));await page.keyboard.press('Escape');
  console.log('PASS English keys and IME Process/Zhuyin payloads: preview R, selected R and M');
  const rotation=await page.evaluate(()=>editor.house.objects.find(o=>o.objectType==='sofa').rotation);
  for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true}])assert.equal(await key('KeyR','Process',extra),false);
  assert.equal(await page.evaluate(()=>editor.house.objects.find(o=>o.objectType==='sofa').rotation),rotation);
  for(const tag of ['input','textarea','div']){
   await page.evaluate(tag=>{const el=document.createElement(tag);el.id='ime-test-field';if(tag==='div')el.contentEditable='true';document.querySelector('.house-shell').append(el);el.focus();},tag);
   assert.equal(await key('KeyR'),false);assert.equal(await key('KeyM'),false);assert.equal(await page.evaluate(()=>editor.state.movingId),null);await page.evaluate(()=>document.querySelector('#ime-test-field').remove());
  }
  await page.locator('[data-h-action="catalog"]').click();assert.equal(await key('KeyR'),false);assert.equal(await key('KeyM'),false);await page.locator('[data-h-action="close-dialog"]').click();await page.locator('[data-h-action="save"]').click();assert.equal(await key('KeyR'),false);assert.equal(await key('KeyM'),false);
  assert.deepEqual(errors,[]);console.log('PASS typing, composition in text fields, modifier keys, modal and non-edit mode remain untouched');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
