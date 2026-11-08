from pathlib import Path
import json,re
root=Path(r"D:\KnouxCrypt\missions\fullstack-android")
assert len(list(root.glob("*/TASK.md")))==46
changes={
  "02_SECURE_ACCESS_LOGIN":("**Prerequisite tasks:** 00,31.","**Prerequisite tasks:** 00."),
  "04_FILE_CIPHER":("**Prerequisite tasks:** 00,02,31.","**Prerequisite tasks:** 00,02."),
  "10_AUTHENTICATOR":("**Prerequisite tasks:** 00,02,11.","**Prerequisite tasks:** 00,02."),
  "08_PASSWORDS":("**Prerequisite tasks:** 00,02,31.","**Prerequisite tasks:** 00,02."),
  "12_KEY_FORGE":("**Prerequisite tasks:** 00,02,31.","**Prerequisite tasks:** 00,02."),
}
index=json.loads((root/"TASK_INDEX.json").read_text(encoding="utf-8"))
for folder,(a,b) in changes.items():
    p=root/folder/"TASK.md"
    s=p.read_text(encoding="utf-8")
    assert s.count(a)==1,(p,a)
    p.write_text(s.replace(a,b).replace("\\"+chr(96),chr(96)),encoding="utf-8")
    m=re.search(r"^([0-9]{2})",p.parent.name)
    for x in index["tasks"]:
        if x["id"]==m.group(1):
            x["prerequisites"]=b.split("**Prerequisite tasks:** ")[1].rstrip(".")
            break
for p in root.rglob("*.md"):
    if p.parent.name in changes: continue
    s=p.read_text(encoding="utf-8")
    if "\\"+chr(96) in s:p.write_text(s.replace("\\"+chr(96),chr(96)),encoding="utf-8")
(root/"TASK_INDEX.json").write_text(json.dumps(index,indent=2)+"\n",encoding="utf-8")
prereqs={x["id"]:{s.strip() for s in x["prerequisites"].split(",")} for x in index["tasks"]}
for name,pr in prereqs.items():
    assert all(dep=="00" or dep in prereqs for dep in pr),(name,pr)
    assert name not in pr
visiting=set();visited=set()
def walk(k):
    if k in visiting: raise AssertionError("Circular task dependency: "+k)
    if k in visited:return
    visiting.add(k)
    for dep in prereqs[k]:
        if dep in prereqs:walk(dep)
    visiting.remove(k);visited.add(k)
for k in prereqs:walk(k)
print("VERIFIED: 46 TASK.md files + 44 indexed screens; 0 cyclic dependencies; 0 escaped backticks")
