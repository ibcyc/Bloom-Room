/* Dependency-free local preview. Works from any checkout location on macOS/Windows/Linux. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
const port=Number(process.argv[2]||process.env.PORT||8767);
if(!Number.isInteger(port)||port<1||port>65535){console.error('Choose a port between 1 and 65535.');process.exit(1);}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.glb':'model/gltf-binary','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const withinRoot=file=>file===root||file.startsWith(root+path.sep);
const server=http.createServer(async(req,res)=>{
  const fail=(status,message,headers={})=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8',...headers});res.end(req.method==='HEAD'?undefined:message);};
  if(!['GET','HEAD'].includes(req.method))return fail(405,'Use GET or HEAD.',{Allow:'GET, HEAD'});
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return fail(400,'Invalid URL.');}
  if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(part=>part.startsWith('.')))return fail(403,'Forbidden.');
  let file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!withinRoot(file))return fail(403,'Forbidden.');
  let stat;
  try{file=await fs.promises.realpath(file);if(!withinRoot(file))return fail(403,'Forbidden.');stat=await fs.promises.stat(file);}catch{return fail(404,'File not found.');}
  if(!stat.isFile())return fail(404,'File not found.');
  const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])||!stat.size)return fail(416,'Invalid byte range.',{'Content-Range':`bytes */${stat.size}`});
    if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    else start=Math.max(0,stat.size-Number(match[2]));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size)return fail(416,'Invalid byte range.',{'Content-Range':`bytes */${stat.size}`});
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length']=stat.size?end-start+1:0;
  res.writeHead(status,headers);
  if(req.method==='HEAD'||!stat.size)return res.end();
  const stream=fs.createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Try: node tools/serve.cjs ${port+1}`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Bloom Room: http://127.0.0.1:${port}/\nPress Ctrl+C to stop. No build or npm install is needed.`));
