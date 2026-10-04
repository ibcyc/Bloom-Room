const fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(__dirname,'../test-artifacts');
module.exports=name=>{fs.mkdirSync(directory,{recursive:true});return path.join(directory,name);};
