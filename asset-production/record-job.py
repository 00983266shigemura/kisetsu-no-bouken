"""Task-local execution journal; no credentials or image bytes in tool output."""
import fcntl,json,os,pathlib,sys,tempfile
root=pathlib.Path(__file__).resolve().parent
entry=json.loads(sys.argv[1])
with (root/'.jobs.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 p=root/'jobs.json'
 d=json.loads(p.read_text()) if p.exists() else {'records':[]}
 d['records'].append(entry)
 fd,tmp=tempfile.mkstemp(dir=root,prefix='.jobs-')
 with os.fdopen(fd,'w') as out:
  json.dump(d,out,ensure_ascii=False,indent=2);out.flush();os.fsync(out.fileno())
 os.replace(tmp,p)
