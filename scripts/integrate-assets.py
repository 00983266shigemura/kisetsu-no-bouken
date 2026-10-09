#!/usr/bin/env python3
"""Validate 110 generated assets, prepare deterministic JPEGs, then integrate only exact QA-approved bytes.
--check is read only. --prepare writes JPEGs + preparation manifest but never source.html.
Default requires raw PNG QA and a second, hash-bound JPEG QA. No auto-PASS or placeholders.
Multi-file commit uses atomic per-file replacements and a recoverable journal; source is committed last.
"""
from __future__ import annotations
import argparse, base64, hashlib, io, json, os, re, sys, tempfile
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
SPECS=ROOT/'content-design/asset-specs.json'
PNGQA=ROOT/'asset-production/visual-qa.json'
JPEGQA=ROOT/'asset-production/jpeg-qa.json'
MANIFEST=ROOT/'asset-production/candidate-manifest.json'
PREPARED=ROOT/'asset-production/jpeg-preparation.json'
JOURNAL=ROOT/'asset-production/.integration-transaction.json'
SOURCE=ROOT/'source.html'
def sha(b):return hashlib.sha256(b).hexdigest()
def readjson(p):return json.loads(p.read_text()) if p.exists() else {}
def atomic(p,b):
 p.parent.mkdir(parents=True,exist_ok=True)
 fd,n=tempfile.mkstemp(prefix='.'+p.name+'-',dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.replace(n,p)
 finally:
  if os.path.exists(n):os.unlink(n)
def jsonbytes(x):return (json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
def qalookup(doc):return {(r.get('path'),r.get('sha256')):r for r in doc.get('records',[])}
def qapass(q):return q and q.get('result')=='PASS' and q.get('readability_120px')=='PASS' and q.get('text_or_answer_leak')=='NONE' and q.get('species_features','PASS')=='PASS'
def jpgbytes(path):
 with Image.open(path) as im:
  if im.format!='PNG':raise ValueError('not a PNG: '+str(path))
  im.load(); im=ImageOps.exif_transpose(im)
  if im.width<120 or im.height<120:raise ValueError('source too small: '+str(path))
  if 'A' in im.getbands() or im.mode=='P':
   rgba=im.convert('RGBA');rgb=Image.new('RGB',rgba.size,'white');rgb.paste(rgba,mask=rgba.getchannel('A'));im=rgb
  else:im=im.convert('RGB')
  im.thumbnail((640,640),Image.Resampling.LANCZOS)
  out=io.BytesIO();im.save(out,format='JPEG',quality=88,subsampling=0,optimize=False,progressive=False)
  b=out.getvalue()
 with Image.open(io.BytesIO(b)) as check:check.load();size=list(check.size)
 return b,size

def recover(checkonly=False):
 if not JOURNAL.exists():return
 j=readjson(JOURNAL)
 if checkonly:raise ValueError('unfinished integration transaction; rerun without --check to recover')
 # Source is commit authority. A fully written new source means both replaces completed.
 if sha(SOURCE.read_bytes())==j['sourceAfter'] and MANIFEST.exists() and sha(MANIFEST.read_bytes())==j['manifestAfter'] and all((ROOT/k).exists() and sha((ROOT/k).read_bytes())==v for k,v in j.get('otherAfterHashes',{}).items()):
  JOURNAL.unlink();return
 for path,key in [(SOURCE,'sourceBeforeBytes'),(MANIFEST,'manifestBeforeBytes')]:
  payload=j[key]
  if payload is None:
   if path.exists():path.unlink()
  else:atomic(path,base64.b64decode(payload))
 for rel,payload in j.get('otherBeforeBytes',{}).items():
  path=ROOT/rel
  if payload is None:
   if path.exists():path.unlink()
  else:atomic(path,base64.b64decode(payload))
 JOURNAL.unlink()

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--check',action='store_true');ap.add_argument('--prepare',action='store_true');ap.add_argument('--prepare-partial',action='store_true');args=ap.parse_args()
 if sum([args.check,args.prepare,args.prepare_partial])>1:ap.error('check/prepare/prepare-partial are mutually exclusive')
 preparing=args.prepare or args.prepare_partial
 recover(args.check)
 specs=readjson(SPECS);records=specs['records']+specs.get('additionalRecords',[])
 if len(records)!=110 or len({r['image_id'] for r in records})!=110:raise ValueError('expected 110 unique specification records')
 pngqa=qalookup(readjson(PNGQA));jpgqa=qalookup(readjson(JPEGQA));issues=[];out=[];embedded={};jpgs={}
 src=SOURCE.read_text();match=re.search(r'window\.__ASSET_DATA__=(.*?);window\.__CONTENT__',src)
 if not match:raise ValueError('embedded asset map not found')
 oldmap=json.loads(match[1]);originalkeys={r['image_id'] for r in specs['records']}
 if not originalkeys.issubset(oldmap):raise ValueError('protected 103 keys absent from source')
 protected=ROOT/'asset-production/manifest-baseline.json';baselineBytes=protected.read_bytes();baselineHash=sha(baselineBytes)
 for spec in records:
  original=spec['image_id'];isold=original in originalkeys
  # One source PNG per generated subject, including three separately generated icons.
  stem=Path(spec['output_path']).stem;pngrel='assets/generated/'+stem+'.png';jpgrel='assets/generated/'+stem+'.jpg';png=ROOT/pngrel
  embedkey=original if isold else jpgrel
  if not png.exists():issues.append({'asset':original,'missing':'PNG','path':pngrel});continue
  pnghash=sha(png.read_bytes());pq=pngqa.get((pngrel,pnghash))
  if not qapass(pq):issues.append({'asset':original,'missing':'exact PNG PASS/readability/no-leak QA','path':pngrel});continue
  try:
   b,size=jpgbytes(png)
   if sha(png.read_bytes())!=pnghash:raise ValueError('PNG changed while processing')
  except Exception as exc:issues.append({'asset':original,'error':str(exc)});continue
  jh=sha(b);jq=jpgqa.get((jpgrel,jh))
  if not preparing and not qapass(jq):issues.append({'asset':original,'missing':'exact JPEG PASS/readability/no-leak QA','path':jpgrel,'sha256':jh})
  jpgs[jpgrel]=b;embedded[embedkey]='data:image/jpeg;base64,'+base64.b64encode(b).decode()
  out.append({'image_id':original,'embed_key':embedkey,'theme_id':spec.get('theme_id'),'original_ledger_status':'PENDING_UNCHANGED' if isold else 'ADDITIONAL','png_path':pngrel,'png_sha256':pnghash,'jpeg_path':jpgrel,'jpeg_sha256':jh,'jpeg_bytes':len(b),'size':size,'png_qa':pq,'jpeg_qa':jq,'status':'PREPARED' if preparing else 'PASS'})
 if args.prepare_partial:
  partial={'ready':False,'partial':True,'required':110,'prepared':len(out),'skipped':issues,'protectedBaselineSha256':baselineHash,'records':out}
  for path,b in jpgs.items():atomic(ROOT/path,b)
  atomic(ROOT/'asset-production/jpeg-preparation-partial.json',jsonbytes(partial))
  print(json.dumps({'ready':False,'partial':True,'prepared':len(out),'skippedCount':len(issues),'sourceChanged':False},ensure_ascii=False));return 0
 if issues:
  print(json.dumps({'ready':False,'required':110,'matchedPNG':len(out),'issues':issues},ensure_ascii=False,indent=2));return 2
 if len(out)!=110 or len(embedded)!=110:raise ValueError('incomplete asset set')
 # Every theme/option path must resolve in resulting map, without external image dependencies.
 contentmatch=re.search(r'window\.__CONTENT__=(.*?);</script>',src);content=json.loads(contentmatch[1]);needed=[t['image'] for t in content['themes']]+[o['image'] for q in content['questions'] for o in q['options'] if o.get('image')]
 if any(k not in embedded for k in needed):raise ValueError('unmapped content image paths: '+str(sorted(set(needed)-set(embedded))))
 summary={'ready':not args.prepare,'assets':110,'jpegTotalBytes':sum(len(b) for b in jpgs.values()),'protectedBaselineSha256':baselineHash,'pngQA':str(PNGQA.relative_to(ROOT)),'jpegQA':str(JPEGQA.relative_to(ROOT)),'records':out}
 if args.check:print(json.dumps({k:v for k,v in summary.items() if k!='records'},ensure_ascii=False,indent=2));return 0
 if args.prepare:
  for path,b in jpgs.items():atomic(ROOT/path,b)
  atomic(PREPARED,jsonbytes(summary));print('PREPARED 110 JPEGs; source unchanged. Review exact JPEG bytes and record jpeg-qa.json before integration.');return 0
 # Replace map once, and replace any direct old data URIs (brand/loading/favicon) throughout source.
 newtext=src[:match.start(1)]+json.dumps(embedded,ensure_ascii=False,separators=(',',':'))+src[match.end(1):]
 for key,olduri in oldmap.items():
  if key in embedded and olduri!=embedded[key]:newtext=newtext.replace(olduri,embedded[key])
 newbytes=newtext.encode();summary.update({'sourceBeforeSha256':sha(src.encode()),'sourceAfterSha256':sha(newbytes),'integration':'all 110 exact JPEG QA PASS; keys and content paths checked','rawPNGArchive':'generated originals are not included in this manifest; preserve generation artifacts independently'})
 summary['specificationPath']=str(SPECS.relative_to(ROOT))
 summary['specificationSha256']=sha(SPECS.read_bytes())
 iconbytes=('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 640 640"><image width="640" height="640" xlink:href="'+embedded['assets/icon.svg']+'"/></svg>').encode()
 summary['externalIconSha256']=sha(iconbytes)
 manifestbytes=jsonbytes(summary)
 if SOURCE.read_bytes()!=src.encode():raise ValueError('source changed concurrently; rerun from fresh state')
 # Journal + source-last commit permits recovery after abrupt termination; never claim cross-file rename atomicity.
 j={'sourceBeforeBytes':base64.b64encode(SOURCE.read_bytes()).decode(),'manifestBeforeBytes':base64.b64encode(MANIFEST.read_bytes()).decode() if MANIFEST.exists() else None,'sourceAfter':sha(newbytes),'manifestAfter':sha(manifestbytes),'otherAfterHashes':{'icon.svg':sha(iconbytes)},'otherBeforeBytes':{'icon.svg':base64.b64encode((ROOT/'icon.svg').read_bytes()).decode() if (ROOT/'icon.svg').exists() else None}}
 atomic(JOURNAL,jsonbytes(j))
 try:
  for path,b in jpgs.items():atomic(ROOT/path,b)
  atomic(ROOT/'icon.svg',iconbytes);atomic(MANIFEST,manifestbytes);atomic(SOURCE,newbytes)
  if protected.read_bytes()!=baselineBytes:raise ValueError('protected baseline changed during integration')
  JOURNAL.unlink()
 except BaseException:
  recover(False);raise
 print('INTEGRATED 110 JPEGs into source; protected 103 baseline unchanged. Rebuild index/SW/AppCache and verify before push.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as exc:print('REJECTED: '+str(exc),file=sys.stderr);sys.exit(2)
