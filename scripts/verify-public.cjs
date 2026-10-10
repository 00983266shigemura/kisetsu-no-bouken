'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const base=process.env.APP_BASE||'https://00983266shigemura.github.io/kisetsu-no-bouken/';
const nonce=process.env.GITHUB_RUN_ID||Date.now().toString();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function read(name){
 const url=new URL(name,base);url.searchParams.set('verify',nonce);
 const res=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'cache-control':'no-cache'}});
 assert.equal(res.status,200,'HTTP '+res.status+' '+name);
 return {bytes:Buffer.from(await res.arrayBuffer()),type:res.headers.get('content-type')||''};
}
async function run(){
 assert(/^[0-9a-f]{64}$/.test(release.releaseId),'invalid release id');
 const live=await read('release.json');
 assert.equal(live.bytes.toString('utf8'),fs.readFileSync('release.json','utf8'),'LIVE_RELEASE_MISMATCH');
 for(const f of release.deployedFiles){
  const r=await read(f.path);
  assert.equal(r.bytes.length,f.bytes,'LIVE_SIZE_MISMATCH '+f.path);
  assert.equal(hash(r.bytes),f.sha256,'LIVE_HASH_MISMATCH '+f.path);
  if(f.path==='index.html'){
   const h=r.bytes.toString('utf8');
   assert(h.includes('<meta name="kisetsu-release-id" content="'+release.releaseId+'">'),'RELEASE_MARKER_MISMATCH');
   assert(h.includes('manifest="./offline.appcache"'),'OFFLINE_MANIFEST_MISSING');
  }
  if(f.path==='offline.appcache')assert(/text\/cache-manifest/i.test(r.type),'APPCACHE_MIME_MISMATCH');
 }
 console.log('PASS production bytes/release '+release.releaseId);
}
run().catch(e=>{console.error('PROD_VERIFY_FAIL '+e.message);process.exitCode=1});
