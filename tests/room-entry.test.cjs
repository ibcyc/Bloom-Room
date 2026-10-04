/* Cloud entry covers the route swap, then returns control; cancellation never mounts a stale room. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const base=process.env.ROOMBLOOM_URL||'http://127.0.0.1:8767';
 const clouds=()=>page.locator('.room-cloud-transition');
 try{
  await page.goto(base);await page.locator('[data-action="skip-intro"]').click();await page.locator('#name').fill('Cloud demo');await page.locator('#login-form button').click();await page.waitForSelector('.welcome-choices');
  await page.goto(base+'/#/create');await page.locator('#roomName').fill('Above the clouds');await page.locator('#create-form button').click();await clouds().waitFor();
  assert.equal(await clouds().count(),1);assert.equal(await page.locator('#app').evaluate(e=>e.inert),true);assert.equal(await page.locator('#create-form').count(),1,'previous page remains until cloud cover');
  await page.waitForTimeout(180);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-cover.png')});
  await page.waitForSelector('#house-stage canvas');assert.equal(await page.locator('#app').evaluate(e=>e.inert),true);
  await page.waitForTimeout(300);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-reveal.png')});
  await clouds().waitFor({state:'detached'});assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);assert.equal(await page.evaluate(()=>document.body.classList.contains('is-entering-room')),false);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('key-cursor-active')),false);
  await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-room.png')});const roomPath=new URL(page.url()).hash;
  await page.locator('[data-h-action="edit"]').click();await page.locator('[data-h-action="save"]').click();assert.equal(await clouds().count(),0,'room controls do not replay entry');
  await page.locator('[aria-label="Leave room"]').click();await page.waitForSelector('[data-hub-mode="homes"]');
  // Navigate away during cover. No delayed callback may replace the chosen destination.
  await page.evaluate(hash=>location.hash=hash,roomPath);await clouds().waitFor();await page.evaluate(()=>location.hash='/homes');await page.waitForSelector('[data-hub-mode="homes"]');await clouds().waitFor({state:'detached'});await page.mouse.move(700,180);
  assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('key-cursor-active')),true,'returning to the retained hub restores its key cursor');
  await page.evaluate(hash=>location.hash=hash,roomPath);await clouds().waitFor();await page.evaluate(()=>location.hash='/profile');await page.waitForSelector('#profile-form');await page.waitForTimeout(800);
  assert.equal(await clouds().count(),0);assert.equal(await page.locator('.house-shell').count(),0);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);assert.equal(await page.locator('#profile-form').count(),1);
  console.log('PASS layered entry, delayed room mount, interaction release, normal cursor, editor controls and cancelled navigation');

  await page.locator('[data-mood-select]').selectOption('woodland');await page.evaluate(hash=>location.hash=hash,roomPath);await clouds().waitFor();await page.waitForSelector('#house-stage canvas');await page.waitForTimeout(330);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-woodland.png')});await clouds().waitFor({state:'detached'});
  await page.reload();await clouds().waitFor();await page.waitForSelector('#house-stage canvas');await clouds().waitFor({state:'detached'});assert.equal(await page.locator('.house-identity').innerText(),'Above the clouds');
  await page.locator('[aria-label="Leave room"]').click();await page.waitForSelector('[data-hub-mode="homes"]');await page.setViewportSize({width:390,height:844});await page.evaluate(hash=>location.hash=hash,roomPath);await clouds().waitFor();await page.waitForSelector('#house-stage canvas');await page.waitForTimeout(300);await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-mobile.png')});await clouds().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  console.log('PASS both moods, remembered room entry, mobile sizing and unchanged saved room');

  await page.locator('[aria-label="Leave room"]').click();await page.waitForSelector('[data-hub-mode="homes"]');await page.evaluate(hash=>location.hash=hash,roomPath);await clouds().waitFor();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('#house-stage canvas');assert.equal(await clouds().count(),0);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  await page.locator('[aria-label="Leave room"]').click();await page.waitForSelector('[data-hub-mode="homes"]');await page.evaluate(hash=>location.hash=hash,roomPath);await page.waitForSelector('#house-stage canvas');assert.equal(await clouds().count(),0);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  // An absent animation library follows the same immediate, usable navigation path.
  await page.locator('[aria-label="Leave room"]').click();await page.waitForSelector('[data-hub-mode="homes"]');await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(hash=>{window.anime=undefined;location.hash=hash;},roomPath);await page.waitForSelector('#house-stage canvas');assert.equal(await clouds().count(),0);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  assert.deepEqual(errors,[]);console.log('PASS reduced motion before/during entry and missing-library fallback without runtime errors');
 }catch(error){await page.screenshot({path:require('./test-artifacts.cjs')('roombloom-cloud-failure.png')});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
