from pathlib import Path
import json
root=Path(r"D:\KnouxCrypt\missions\fullstack-android")
idx=root/"TASK_INDEX.json"
data=json.loads(idx.read_text(encoding="utf-8"))
for num,slug in [(5,"SHADOW_VAULT"),(22,"LOCAL_TRANSFER")]:
    folder=root/(f"{num:02d}_{slug}")
    f=folder/"TASK.md"
    src=f.read_text(encoding="utf-8")
    old="**Prerequisite tasks:** 00,04,29." if num==5 else "**Prerequisite tasks:** 00,16,40."
    new="**Prerequisite tasks:** 00,04." if num==5 else "**Prerequisite tasks:** 00,16."
    assert src.count(old)==1,(folder,old)
    f.write_text(src.replace(old,new),encoding="utf-8")
    for entry in data["tasks"]:
        if entry["id"]==f"{num:02d}":entry["prerequisites"]=new.split(":** ")[1].rstrip(".")
idx.write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8")
print("Corrected dependent task cycles in 05 and 22.")
