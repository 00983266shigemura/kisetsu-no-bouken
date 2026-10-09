/* Build iOS 10 version from source.html: npm install --no-save typescript@5.9.3 */
'use strict';
var fs=require('fs'),ts=require('typescript'),crypto=require('crypto');
var html=fs.readFileSync('source.html','utf8');
var scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
if(scripts.length!==3)throw Error('Expected 3 inline scripts, found '+scripts.length);
var poly=[
"(function(){",
"if(!Object.values)Object.values=function(o){return Object.keys(o).map(function(k){return o[k]})};",
"if(!Object.entries)Object.entries=function(o){return Object.keys(o).map(function(k){return[k,o[k]]})};",
"if(!Object.fromEntries)Object.fromEntries=function(xs){var o={};for(var i=0;i<xs.length;i++)o[xs[i][0]]=xs[i][1];return o};",
"if(!Array.prototype.includes)Array.prototype.includes=function(x){return this.indexOf(x)!==-1};",
"if(!String.prototype.padStart)String.prototype.padStart=function(n,c){var s=String(this),p=String(c||' ');while(s.length<n)s=p+s;return s.slice(-n)};",
"if(!Number.isInteger)Number.isInteger=function(n){return typeof n==='number'&&isFinite(n)&&Math.floor(n)===n};",
"if(window.NodeList&&!NodeList.prototype.forEach)NodeList.prototype.forEach=Array.prototype.forEach;",
"var d=document.getElementById('dialog');if(d&&!d.showModal){",
"var b=document.createElement('div');b.style.cssText='position:fixed;top:0;bottom:0;left:0;right:0;background:rgba(25,40,36,.65);z-index:1999;display:none';document.body.appendChild(b);d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');",
"d.showModal=function(){b.style.display='block';d.setAttribute('open','');d.style.cssText='display:block;position:fixed;top:6%;left:4%;width:92%;max-width:600px;max-height:85%;overflow:auto;margin:0;z-index:2000'};",
"d.close=function(){d.removeAttribute('open');d.style.display='none';b.style.display='none';var e=document.createEvent('Event');e.initEvent('close',false,false);d.dispatchEvent(e)};b.onclick=function(){d.close()};}",
"})();"].join("\n");
var app=scripts[2][2];
app=app.replace(/app\.focus\(\{preventScroll:true\}\)/g,'app.focus()');
app=app.replace("voices.find(v=>v.lang.startsWith('ja')&&v.localService)||null","voices.find(v=>v.lang&&v.lang.indexOf('ja')===0&&v.localService)||voices.find(v=>v.lang&&v.lang.indexOf('ja')===0)||null");
app=app.replace("const KEY='kisetsu-adventure:v1:'+new URL('.',location.href).pathname;","const KEY='kisetsu-adventure:v1:'+location.pathname.replace(/[^\\/]*$/,'');");
var legacy="function legacyOffline(){if(!window.applicationCache){status('オフライン保存に対応していません。',true);return;}var c=window.applicationCache;function done(){if(storageOK)status('✓ オフラインでも あそべるよ');}function bad(){status('オフライン保存に失敗しました。',true)}c.addEventListener('cached',done,false);c.addEventListener('noupdate',done,false);c.addEventListener('updateready',done,false);c.addEventListener('error',bad,false);if(c.status===c.IDLE||c.status===c.UPDATEREADY)done();else status('オフラインの じゅんびちゅう…')}\n";
app=app.replace('async function offline(){',legacy+'async function offline(){');
app=app.replace("if(!('serviceWorker'in navigator)||!window.isSecureContext){status('オンラインで あそべます。オフラインには HTTPSか localhostが ひつようです。',true);return;}","if(!('serviceWorker'in navigator)){legacyOffline();return;}if(window.isSecureContext===false){status('HTTPSがひつようです。',true);return;}");
app=app.replace("if(window.speechSynthesis){setupVoice();window.speechSynthesis.addEventListener('voiceschanged',setupVoice);}","if(window.speechSynthesis){setupVoice();if(window.speechSynthesis.addEventListener)window.speechSynthesis.addEventListener('voiceschanged',setupVoice);}");
function compile(s){var out=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES5,module:ts.ModuleKind.None,downlevelIteration:true}}).outputText;if(/\?\.|\bconst\b|\blet\b|\basync function\b|=>/.test(out))throw Error('non-ES5 output');return out;}
var css="button:focus,a:focus{outline:3px solid #5985ba}h1{font-size:32px}.question{font-size:26px}.picture{height:260px}dialog{display:none;width:92%;max-width:600px}dialog[open]{display:block}.brand img{margin-right:12px}@supports not (display:grid){.map,.choices,.gallery,.bottom-actions{display:flex;flex-wrap:wrap;justify-content:space-between}.map .country{width:48%;margin-bottom:14px}.choices .choice,.choices .name-option{width:31%;margin-bottom:12px}.choices.two .choice,.choices.four .choice{width:48%}.gallery .specimen{width:23%;margin-bottom:11px}.bottom-actions>*{width:48%}.name-option{display:block}.name-option>*{display:block;margin-top:6px}.country .go{display:block;text-align:center;line-height:41px}}@media(max-width:540px){h1{font-size:28px}.question{font-size:21px}.picture{height:230px}}";
html=html.replace('</style>',css+'</style>').replace('<html lang="ja">','<html lang="ja" manifest="./offline.appcache">');
html=html.replace('<meta name="theme-color"','<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="theme-color"');
html=html.replace(scripts[1][0],'<script>'+poly+'\n'+compile(scripts[1][2])+'</script>');
html=html.replace(scripts[2][0],'<script>'+compile(app)+'</script>');
html=html.replace('きせつのぼうけん · 1.0','きせつのぼうけん · iOS 10対応');
fs.writeFileSync('index.html',html);
var sw="const CACHE='kisetsu-adventure-v3-ios10-20261009';const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./sw.js'];self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.indexOf('kisetsu-adventure-')===0&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin||u.pathname.indexOf(new URL(self.registration.scope).pathname)!==0)return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});self.addEventListener('message',e=>{if(e.data&&e.data.type==='CACHE_STATUS')caches.open(CACHE).then(c=>c.match('./index.html')).then(r=>{if(e.ports&&e.ports[0])e.ports[0].postMessage({ready:!!r})});if(e.data&&e.data.type==='ACTIVATE')self.skipWaiting()});";
fs.writeFileSync('sw.js',sw);
var rev=crypto.createHash('sha256').update(html).digest('hex').slice(0,16);
fs.writeFileSync('offline.appcache','CACHE MANIFEST\n# build '+rev+'\nCACHE:\n./\n./index.html\n./icon.svg\n./manifest.webmanifest\n./sw.js\nNETWORK:\n*\n');
console.log('ES5 website generated, length '+html.length+' rev '+rev);
