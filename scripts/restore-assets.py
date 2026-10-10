#!/usr/bin/env python3
"""Restore the 110 final JPEG bytes from self-contained source.html, verifying candidate provenance.
--check performs read-only verification. Default restores files under assets/generated.
Does not recreate generated original PNGs or claim the iOS/device release gates are passed.
"""
import argparse,base64,hashlib,io,json,os,re,sys,tempfile
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--output',type=Path,default=ROOT/'assets/generated');p.add_argument('--manifest-sha256',help='optional trusted manifest hash obtained by remote readback');a=p.parse_args()
 ledger=ROOT/'asset-production/candidate-manifest.json'
 if not ledger.exists():raise ValueError('final candidate manifest does not exist; integration is incomplete')
 manifestbytes=ledger.read_bytes();manifesthash=sha(manifestbytes)
 if a.manifest_sha256 and manifesthash!=a.manifest_sha256:raise ValueError('manifest does not match trusted SHA256')
 manifest=json.loads(manifestbytes);records=manifest.get('records',[])
 if len(records)!=110 or len({r['embed_key'] for r in records})!=110:raise ValueError('manifest must contain 110 unique final assets')
 src=(ROOT/'source.html').read_text();m=re.search(r'window\.__ASSET_DATA__=(.*?);window\.__CONTENT__',src)
 if not m:raise ValueError('embedded source map absent')
 data=json.loads(m[1]);pending=[];names=set()
 if len(data)!=110:raise ValueError('source must embed exactly 110 assets')
 if manifest.get('sourceAfterSha256') and sha(src.encode())!=manifest['sourceAfterSha256']:raise ValueError('source differs from integration manifest hash')
 for r in records:
  if r.get('status')!='PASS':raise ValueError('asset is not PASS: '+r['image_id'])
  rel=Path(r['jpeg_path'])
  if rel.parent!=Path('assets/generated') or rel.suffix!='.jpg':raise ValueError('unexpected JPEG path')
  if rel.name in names:raise ValueError('duplicate destination')
  names.add(rel.name)
  uri=data.get(r['embed_key'],'');prefix='data:image/jpeg;base64,'
  if not uri.startswith(prefix):raise ValueError('asset has wrong MIME or is absent: '+r['image_id'])
  b=base64.b64decode(uri[len(prefix):],validate=True)
  if sha(b)!=r['jpeg_sha256'] or len(b)!=r['jpeg_bytes']:raise ValueError('JPEG hash/length mismatch: '+r['image_id'])
  with Image.open(io.BytesIO(b)) as im:
   im.load()
   if im.format!='JPEG' or list(im.size)!=r['size']:raise ValueError('JPEG decode/dimension mismatch')
  pending.append((rel.name,b))
 if not a.check:
  a.output.mkdir(parents=True,exist_ok=True)
  for name,b in pending:
   fd,n=tempfile.mkstemp(prefix='.'+name+'-',dir=a.output)
   try:
    with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
    os.replace(n,a.output/name)
   finally:
    if os.path.exists(n):os.unlink(n)
 print(json.dumps({'manifestSha256':manifesthash,'checked':len(pending),'restored':0 if a.check else len(pending),'exactHashMatch':True,'sourceChanged':False,'originalPNGRestored':False},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception as e:print('REJECTED: '+str(e),file=sys.stderr);sys.exit(2)
