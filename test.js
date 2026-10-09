'use strict';
var fs=require('fs'),vm=require('vm'),assert=require('assert');
var html=fs.readFileSync('index.html','utf8');
var scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(x=>x[2]),store={};
function launch(){
 var elements={};
 function el(s){if(!elements[s])elements[s]={id:s,innerHTML:'',textContent:'',open:false,attributes:{},dataset:{},style:{},classList:{toggle:function(){}},focus:function(){},scrollIntoView:function(){},addEventListener:function(){},setAttribute:function(k,v){this.attributes[k]=v;if(k==='open')this.open=true},removeAttribute:function(k){delete this.attributes[k];this.open=false},appendChild:function(){},dispatchEvent:function(){}};return elements[s]}
 var d={querySelector:function(s){return el(s.charAt(0)==='#'?s.slice(1):s)},querySelectorAll:function(){return []},getElementById:el,body:el('body'),createElement:function(s){return el('created-'+s)},createEvent:function(){return{initEvent:function(){}}}};
 var w={document:d,scrollTo:function(){},location:{pathname:'/kisetsu-no-bouken/',href:'https://example.com/kisetsu-no-bouken/'},applicationCache:{IDLE:1,UPDATEREADY:4,status:1,addEventListener:function(){}}};
 var c={window:w,document:d,location:w.location,navigator:{},Promise:Promise,console:console,localStorage:{getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v}},setTimeout:setTimeout,clearTimeout:clearTimeout};
 vm.createContext(c);vm.runInContext('delete Object.values;delete Object.entries;delete Object.fromEntries;delete Array.prototype.includes;delete String.prototype.padStart;',c);
 scripts.forEach(function(code){vm.runInContext(code,c,{timeout:10000})});return {ctx:c,elements:elements};
}
(async function(){
 assert(html.indexOf('manifest="./offline.appcache"')!==-1);
 assert(html.indexOf('@supports not (display:grid)')!==-1);
 assert(fs.readFileSync('offline.appcache','utf8').indexOf('CACHE MANIFEST')===0);
 var a=launch();await new Promise(function(r){setTimeout(r,50)});
 var data=vm.runInContext('({t:themes,q:questions,s:sources,e:E.validate(themes,questions),i:window.__ASSET_DATA__})',a.ctx);
 assert.equal(data.t.length,100);assert.equal(data.q.length,240);assert.equal(data.e.length,0);assert(data.s.length>20);
 assert.equal(data.t.filter(function(x){return !data.i[x.image]}).length,0);
 assert(a.elements.app.innerHTML.indexOf('はるのくに')!==-1);
 assert(typeof a.elements.dialog.showModal==='function');
 assert.equal(vm.runInContext('typeof Object.fromEntries',a.ctx),'function');
 vm.runInContext('start("spring")',a.ctx);var seen=0;
 while(vm.runInContext('p.session!==null',a.ctx)&&seen<6){
   var q=vm.runInContext('currentQ()',a.ctx);assert(q.options.length>=2&&q.options.length<=4);
   if(q.type==='order')q.options.forEach(function(o){vm.runInContext('pick('+JSON.stringify(o.id)+')',a.ctx)});
   else vm.runInContext('pick('+JSON.stringify(q.answer===q.options[0].id?q.options[1].id:q.options[0].id)+')',a.ctx);
   vm.runInContext('submit();next()',a.ctx);seen++;
 }
 assert.equal(seen,5);assert.equal(vm.runInContext('p.stages',a.ctx),1);assert.equal(vm.runInContext('p.stamps.spring.length',a.ctx),1);assert(vm.runInContext('E.reviewCount(p)',a.ctx)>0);
 vm.runInContext('home();book();parents();document.querySelector("#dialog").close();home()',a.ctx);
 var b=launch();await new Promise(function(r){setTimeout(r,50)});
 assert.equal(vm.runInContext('p.stages',b.ctx),1);assert.equal(vm.runInContext('p.stamps.spring.length',b.ctx),1);assert(b.elements.status.textContent.indexOf('オフライン')!==-1);
 console.log('PASS: 100 themes, 240 questions, '+data.s.length+' sources, '+Object.keys(data.i).length+' local images, ES5 polyfills');
 console.log('PASS: quiz, scoring, reward, review, dialog, localStorage reload and legacy offline fallback');
})().catch(function(e){console.error(e.stack);process.exit(1)});
