from pathlib import Path
import json,hashlib
r=Path(r"D:\KnouxCrypt\missions\fullstack-android")
data=json.loads((r/"TASK_INDEX.json").read_text(encoding="utf-8"))["tasks"]
assert len(data)==44
files=list(r.glob("*/TASK.md"))
assert len(files)==46
assert all(f.stat().st_size>1500 for f in files)
refs={t["id"]:set(x.strip() for x in t["prerequisites"].split(",")) for t in data}
for t in data:
    dep=refs[t["id"]]
    assert all(x=="00" or x in refs for x in dep),(t["id"],dep)
state={}
def visit(n,chain):
    if state.get(n)==1:raise RuntimeError("CYCLE "+">".join(chain+[n]))
    if state.get(n)==2:return
    state[n]=1
    for d in refs[n]:
        if d in refs:visit(d,chain+[n])
    state[n]=2
for n in refs:visit(n,[])
for t in data:
    p=r/t["path"]
    content=p.read_text(encoding="utf-8")
    assert "Prerequisite tasks:" in content and content.count("##")>=5
    assert "\\"+chr(96) not in content
print("VERIFIED 46 TASK.md, 44 screen contracts, 0 cycles, all non-empty and clean markdown")
print("FIRST: "+str(data[0]))
print("LAST: "+str(data[-1]))
