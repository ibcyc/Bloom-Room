/* The welcome hub expands in place; the key cursor follows the signed-in flow only. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const base=process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767';
 const cursor=()=>page.locator('#key-cursor'),mode=async name=>page.waitForSelector(`[data-hub-mode="${name}"]`);
 try{
  await page.goto(base);await page.locator('[data-action="skip-intro"]').click();await page.mouse.move(500,500);
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('key-cursor-active')),false);
  await page.locator('#name').fill('Motion demo');await page.locator('#login-form button').click();await mode('welcome');await page.waitForTimeout(500);
  await page.mouse.move(1100,220);assert.equal(await cursor().isVisible(),true);assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).cursor),'none');
  assert.equal(await page.locator('.welcome-page .key-art').count(),0);
  assert.equal((await page.locator('.topbar').boundingBox()).height,84);
  await page.evaluate(()=>{window.hubBefore=document.querySelector('.welcome-page');window.cardsBefore=document.querySelector('.welcome-choices');window.navBefore=document.querySelector('.topbar');});
  const before=await page.locator('.welcome-choices').boundingBox();
  await page.locator('.journey-choice[data-go="/homes"]').click();await mode('homes');
  const first=await page.locator('#hub-homes').evaluate(el=>({opacity:+getComputedStyle(el).opacity,y:new DOMMatrixReadOnly(getComputedStyle(el).transform).m42}));
  assert.ok(first.opacity<1&&first.y>1,'yellow options begin below their destination');
  await page.waitForTimeout(160);
  const middle=await page.locator('#hub-homes').evaluate(el=>({opacity:+getComputedStyle(el).opacity,y:new DOMMatrixReadOnly(getComputedStyle(el).transform).m42}));
  assert.ok(middle.y<first.y&&middle.opacity>first.opacity,'options slide up instead of switching instantly');
  assert.equal(await page.evaluate(()=>hubBefore===document.querySelector('.welcome-page')&&cardsBefore===document.querySelector('.welcome-choices')&&navBefore===document.querySelector('.topbar')),true);
  assert.deepEqual(await page.locator('.welcome-choices').boundingBox(),before);
  await page.waitForTimeout(600);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-hub-community.png')});
  await page.locator('.journey-choice[data-go="/find"]').click();await mode('find');
  await page.locator('.journey-choice[data-go="/homes"]').click();await mode('homes');
  await page.locator('.journey-choice[data-go="/find"]').click();await mode('find');await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-hub-panel]:visible').count(),1);assert.equal(await page.locator('#hub-find .gateway-choice:visible').count(),2);
  await page.goBack();await mode('homes');await page.goForward();await mode('find');
  await page.locator('[data-mood-select]').selectOption('woodland');await page.waitForTimeout(700);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-hub-woodland.png')});
  await page.locator('#hub-find [data-go="/habits"]').click();await page.locator('#preferences').fill('Quiet evenings');await page.locator('#preferences').hover();
  assert.equal(await cursor().isVisible(),true);assert.equal(await page.locator('#preferences').evaluate(e=>getComputedStyle(e).cursor),'none');
  await page.locator('[data-action="about"]').click();await page.getByRole('button',{name:'Close dialog',exact:true}).hover();
  assert.equal(await cursor().evaluate(e=>e.matches(':popover-open')),true);assert.equal(await cursor().isVisible(),true);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.goto(base+'/#/create');await page.locator('#roomName').fill('Cursor home');await page.locator('#create-form button').click();await page.waitForSelector('#house-stage canvas');
  await page.mouse.move(720,500);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('key-cursor-active')),false);assert.equal(await cursor().isVisible(),false);assert.notEqual(await page.locator('#house-stage canvas').evaluate(e=>getComputedStyle(e).cursor),'none');
  await page.locator('[aria-label="Leave room"]').click();await mode('homes');await page.mouse.move(720,180);assert.equal(await cursor().isVisible(),true);
  console.log('PASS stable hub DOM/card positions, upward animation, rapid switches/history, full-flow cursor including dialogs, native room cursor and return');

  await page.setViewportSize({width:390,height:844});await page.locator('[data-mood-select]').selectOption('macaron');await page.waitForTimeout(300);
  assert.equal((await page.locator('.topbar').boundingBox()).height,74);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-hub-mobile.png'),fullPage:true});
  await page.locator('[data-go="/profile"]').click();await page.locator('[data-action="logout"]').click();await page.waitForSelector('.welcome-stage');await page.mouse.move(100,300);assert.equal(await cursor().isVisible(),false);
  const quiet=await browser.newContext({reducedMotion:'reduce'}),q=await quiet.newPage();await q.goto(base);await q.locator('#name').fill('Quiet demo');await q.locator('#login-form button').click();await q.locator('.journey-choice[data-go="/homes"]').click();await q.waitForSelector('[data-hub-mode="homes"]');assert.equal(await q.locator('#hub-homes').evaluate(e=>getComputedStyle(e).opacity),'1');await quiet.close();
  assert.deepEqual(errors,[]);console.log('PASS compact responsive navbar, logout cursor restoration and reduced-motion expansion without runtime errors');
 }catch(e){await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-hub-failure.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
