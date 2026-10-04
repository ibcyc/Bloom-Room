/* Check a downloaded copy without installing dependencies or changing browser data. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),files=new Set(),references=new Set();
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(['node_modules','.git','test-artifacts'].includes(entry.name))continue;
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);else files.add(path.relative(root,file).split(path.sep).join('/'));
}}
walk(root);
function reference(value,from='index.html'){
  if(!value||/^(?:data:|blob:|https?:|#)/.test(value))return;
  const clean=value.split(/[?#]/)[0];
  assert.ok(!clean.startsWith('/'),`Absolute URL would fail in a hosted subdirectory: ${value}`);
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(from),clean));
  assert.ok(files.has(resolved),`Missing file or wrong filename case: ${resolved} (from ${from})`);
  references.add(resolved);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))reference(match[1]);
for(const file of files){
  if(!file.endsWith('.css'))continue;
  const css=fs.readFileSync(path.join(root,file),'utf8');
  for(const match of css.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g))reference(match[1],file);
}
// Art names and favicons are assembled dynamically in design.js.
for(const name of ['key.png','bow.png','star.png','house-logos.png','logo-macaron.svg','logo-woodland.svg'])reference('assets/design/'+name);
const media=fs.readFileSync(path.join(root,'house/media.js'),'utf8');
for(const match of media.matchAll(/url:'([^']+)'/g))reference(match[1]);
for(const file of ['vendor/THREE-LICENSE.txt','vendor/ANIME-LICENSE.md','assets/design/CREDITS.txt','house/audio/CREDITS.txt','assets/fonts/amaticsc-OFL.txt','assets/fonts/barriecito-OFL.txt','assets/fonts/caveat-OFL.txt'])reference(file);
const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'house/presets/default-house.js'),'utf8'),context);
assert.deepEqual(JSON.parse(JSON.stringify(context.RoomBloomHouse.DefaultHousePreset)),JSON.parse(fs.readFileSync(path.join(root,'house/presets/default-house.json'),'utf8')),'Embedded and JSON default houses differ');
console.log(`PASS: ${references.size} required resource paths and licenses exist with exact case; embedded default matches JSON.`);
