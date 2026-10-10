'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=Array.from(html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),x=>x[2]);
const store={},elements={};
function el(s){
 if(!elements[s])elements[s]={id:s,innerHTML:'',textContent:'',open:false,attributes:{},dataset:{},style:{},classList:{toggle(){}},focus(){},scrollIntoView(){},addEventListener(){},setAttribute(k,v){this.attributes[k]=v;if(k==='open')this.open=true},removeAttribute(k){delete this.attributes[k];this.open=false},appendChild(){},dispatchEvent(){}};
 return elements[s];
}
const d={querySelector:s=>el(s.charAt(0)==='#'?s.slice(1):s),querySelectorAll:()=>[],getElementById:el,body:el('body'),createElement:s=>el('created-'+s),createEvent:()=>({initEvent(){}})};
const w={document:d,scrollTo(){},location:{pathname:'/kisetsu-no-bouken/',href:'https://example.com/kisetsu-no-bouken/'},applicationCache:{IDLE:1,UPDATEREADY:4,status:1,addEventListener(){}}};
const context={window:w,document:d,location:w.location,navigator:{},Promise,console,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},setTimeout,clearTimeout};
vm.createContext(context);
for(const script of scripts)vm.runInContext(script,context,{timeout:10000});
function labels(markup){return Array.from(markup.matchAll(/<span class="tag">([^<]*)<\/span>/g),m=>m[1]);}
const expected=['3・4・5がつ','6・7・8がつ','9・10・11がつ','12・1・2がつ'];
function verify(markup){assert.deepStrictEqual(labels(markup),expected,'Rendered labels must display only months in seasonal order');}
setTimeout(()=>{
 try{
   assert.equal(typeof vm.runInContext('home',context),'function','home() absent');
   vm.runInContext('home()',context);
   verify(elements.app.innerHTML);
   assert.throws(()=>verify(elements.app.innerHTML.replace('3・4・5がつ','1 · 3・4・5がつ')),/Rendered labels/,'Ordinal-prefix mutation not detected');
   assert.throws(()=>verify(elements.app.innerHTML.replace('12・1・2がつ','12・1・3がつ')),/Rendered labels/,'Winter-month mutation not detected');
   console.log('PASS: actual compiled home DOM has all four correct season labels; injected ordinal/month errors blocked');
 }catch(e){console.error(e.stack);process.exitCode=1;}
},50);
