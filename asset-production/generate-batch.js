(async()=>{
const cwd="/workspace/scratch/4589eefa35d5/kisetsu-no-bouken",sh=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const py="import json,pathlib;d=json.load(open('content-design/asset-specs.json'));q=[x for x in d['records']+d.get('additionalRecords',[]) if not pathlib.Path(x['output_path'].replace('.jpg','.png')).exists()];print(json.dumps(q[:1],ensure_ascii=False))";
const raw=await tools.exec_command({cmd:"python -c "+sh(py),workdir:cwd,max_output_tokens:4000});const batch=JSON.parse(raw.output);
const results=await Promise.allSettled(batch.map(async x=>{
const id=x.output_path.split("/").pop().split(".").slice(0,-1).join(".");
const prompt="Use case: scientific-educational. Single square educational watercolor asset for Japanese elementary entrance exam ages 5-6. Subject "+x.name+". Required features: "+x.required_features.join("; ")+". Avoid: "+x.forbidden_features.join("; ")+". Precise realistic species/object shapes, crisp edges with soft shading, natural-history illustration matching the existing watercolor set. Plain ivory-white isolated background, centered whole subject, generous margins, readable at120px. No text, numbers, watermark, seasonal color background, unrelated objects, or collage.";
const startedAt=new Date().toISOString();const jobId=id+"-"+startedAt;
await tools.exec_command({cmd:"python asset-production/record-job.py "+sh(JSON.stringify({jobId,id,startedAt,state:"RUNNING",prompt})),workdir:cwd,max_output_tokens:100});
let r=await tools.image_gen__imagegen({prompt,transparent_background:false});
const source=(r.output_hint||"").split(" as ")[1]?.split(" ")[0];
if(!source)throw Error("No artifact for "+id);
const record={id,originalImageId:x.image_id,originalOutput:x.output_path,sourcePath:source,workspacePath:x.output_path.replace(".jpg",".png"),prompt,generation:"GENERATED",visualQA:"PENDING",startedAt,completedAt:new Date().toISOString(),jobId};
const save="import json,pathlib,hashlib,sys,shutil,fcntl;from PIL import Image;lock=open(\'asset-production/.progress.lock\',\'a\');fcntl.flock(lock,fcntl.LOCK_EX);p=pathlib.Path('asset-production/progress.json');d=json.loads(p.read_text()) if p.exists() else {'records':[]};r=json.loads(sys.argv[1]);shutil.copyfile(r['sourcePath'],r['workspacePath']);im=Image.open(r['workspacePath']);r.update(sha256=hashlib.sha256(pathlib.Path(r['workspacePath']).read_bytes()).hexdigest(),width=im.width,height=im.height);d['records']=[a for a in d['records'] if a['id']!=r['id']]+[r];p.write_text(json.dumps(d,ensure_ascii=False,indent=2));print(r['id'])";
const z=await tools.exec_command({cmd:"python -c "+sh(save)+" "+sh(JSON.stringify(record)),workdir:cwd,max_output_tokens:100});if(z.exit_code!==0)throw Error("save");await tools.exec_command({cmd:"python asset-production/record-job.py "+sh(JSON.stringify({jobId,id,completedAt:new Date().toISOString(),state:"SAVED",path:record.workspacePath})),workdir:cwd,max_output_tokens:100});text({saved:id});
}));for(const r of results)if(r.status==="rejected")throw r.reason;text({batchComplete:batch.length});
})()