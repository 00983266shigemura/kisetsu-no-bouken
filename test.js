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
 assert.equal(data.t.length,103);assert.equal(data.q.length,352);assert.equal(data.e.length,0);assert(data.s.length>20);
 assert.equal(data.t.filter(function(x){return !data.i[x.image]&&!x.image.startsWith('assets/generated/')}).length,0);
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
 for(const typ of ['multi','odd','event','clue','marks','scene','pairing']){var q2=data.q.find(function(q){return q.type===typ});assert(q2);vm.runInContext('p.session={season:"spring",items:[{id:'+JSON.stringify(q2.id)+',options:'+JSON.stringify(q2.options.map(o=>o.id))+'}],index:0,results:[],answer:null,selected:null,order:[]};quiz()',b.ctx);[].concat(q2.answer).forEach(function(id){if(q2.type==='pairing'){var pair=id.split(':');pair.forEach(function(v){vm.runInContext('pick('+JSON.stringify(v)+')',b.ctx)});}else if(q2.type==='marks'){var mark=id.split(':');vm.runInContext('pick('+JSON.stringify(mark[0])+')',b.ctx);if(mark[1]==='cross')vm.runInContext('pick('+JSON.stringify(mark[0])+')',b.ctx)}else vm.runInContext('pick('+JSON.stringify(id)+')',b.ctx)});vm.runInContext('submit()',b.ctx);assert(vm.runInContext('p.session.answer.good',b.ctx));}
 var mq=data.q.find(function(q){return q.type==='multi'});assert(vm.runInContext('E.correct('+JSON.stringify(mq)+','+JSON.stringify(mq.answer.slice().reverse())+')',b.ctx));assert(!vm.runInContext('E.correct('+JSON.stringify(mq)+','+JSON.stringify([mq.answer[0],mq.answer[0]])+')',b.ctx));
 vm.runInContext('p.session=null;start("spring",false,true)',b.ctx);assert(!/のくに/.test(b.elements.app.innerHTML));var cq=vm.runInContext('currentQ()',b.ctx);[].concat(cq.answer).forEach(function(id){if(cq.type==='pairing'){id.split(':').forEach(function(v){vm.runInContext('pick('+JSON.stringify(v)+')',b.ctx)});}else if(cq.type==='marks'){var mk=id.split(':');vm.runInContext('pick('+JSON.stringify(mk[0])+')',b.ctx);if(mk[1]==='cross')vm.runInContext('pick('+JSON.stringify(mk[0])+')',b.ctx)}else vm.runInContext('pick('+JSON.stringify(id)+')',b.ctx)});vm.runInContext('submit()',b.ctx);assert(vm.runInContext('p.session.answer.good',b.ctx));assert(!/わかったね|correct|right-answer/.test(b.elements.app.innerHTML));
 var retired=data.q.find(q=>q.retired);vm.runInContext('p.answers={};p.answers['+JSON.stringify(retired.id)+']={misses:1,streak:0};',b.ctx);assert.equal(vm.runInContext('E.reviewCount(p,questions)',b.ctx),0);assert(vm.runInContext('p.answers['+JSON.stringify(retired.id)+'].misses',b.ctx)===1);
 for(const qt of ['odd','multi','clue','marks','scene','pairing']){const z=data.q.find(q=>q.type===qt);assert.equal(vm.runInContext('questionSpeech('+JSON.stringify(z)+',{challenge:true})',b.ctx),z.prompt);}
 var sw=fs.readFileSync('sw.js','utf8');assert(!sw.includes('crypto'));var listeners={},deleted=[];vm.runInNewContext(sw,{self:{registration:{scope:'https://example.com/kisetsu/'},clients:{claim:()=>Promise.resolve()},addEventListener:(type,fn)=>listeners[type]=fn},caches:{keys:()=>Promise.resolve(['kisetsu-adventure-https://example.com/other/-old','kisetsu-adventure-https://example.com/kisetsu/-old']),delete:key=>{deleted.push(key);return Promise.resolve()}},Promise,URL});await new Promise((resolve,reject)=>listeners.activate({waitUntil:p=>p.then(resolve,reject)}));assert.equal(deleted.length,1);assert(deleted[0].includes('/kisetsu/'));
 console.log('PASS: 103 themes, 352 questions, '+data.s.length+' sources, '+Object.keys(data.i).length+' local images, ES5 polyfills');
 const pq=data.q.find(q=>q.type==='pairing');assert(vm.runInContext('E.correct('+JSON.stringify(pq)+','+JSON.stringify(pq.answer.slice().reverse())+')',b.ctx));assert(!vm.runInContext('E.correct('+JSON.stringify(pq)+','+JSON.stringify([pq.answer[0],pq.answer[0]])+')',b.ctx));
 console.log('PASS: quiz, scoring, reward, review, dialog, localStorage reload and legacy offline fallback');
})().catch(function(e){console.error(e.stack);process.exit(1)});
