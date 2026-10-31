"""Verify actual eye pixels in shared Chromium captures, not only CSS opacity.
Uses Python's standard library to decode the browser's small RGB/RGBA PNG crops.
"""
import hashlib,json,os,pathlib,struct,subprocess,tempfile,zlib
out=pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-eyes-'));out.mkdir(parents=True,exist_ok=True)
def browser(*args):
 r=subprocess.run(['coderabbit-agent-browser',*map(str,args)],capture_output=True,text=True)
 if r.returncode:raise AssertionError(r.stderr or r.stdout)
 return r.stdout

def pixels(path):
 data=path.read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n';i=8;compressed=b''
 while i<len(data):
  length=struct.unpack('>I',data[i:i+4])[0];kind=data[i+4:i+8];chunk=data[i+8:i+8+length];i+=12+length
  if kind==b'IHDR':w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
  if kind==b'IDAT':compressed+=chunk
 assert depth==8 and color in [2,6] and interlace==0 and w<=512 and h<=512,(w,h,depth,color,interlace)
 channels=3 if color==2 else 4;stride=w*channels;raw=zlib.decompress(compressed);rows=[];previous=bytearray(stride)
 for y in range(h):
  offset=y*(stride+1);kind=raw[offset];row=bytearray(raw[offset+1:offset+1+stride]);assert kind in range(5)
  for x in range(stride):
   a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
   if kind==1:predict=a
   elif kind==2:predict=b
   elif kind==3:predict=(a+b)//2
   elif kind==4:
    p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);predict=a if pa<=pb and pa<=pc else b if pb<=pc else c
   else:predict=0
   row[x]=(row[x]+predict)&255
  rows.append(row);previous=row
 def luminance(cx,cy):
  x,y=round(cx*w/1254),round(cy*h/1254);values=[]
  for yy in range(y-1,y+2):
   for xx in range(x-1,x+2):
    r,g,b=rows[yy][xx*channels:xx*channels+3];values.append(.2126*r+.7152*g+.0722*b)
  return sum(values)/len(values)
 return {'width':w,'height':h,'leftEye':luminance(453,713),'rightEye':luminance(801,713)}

browser('set','viewport',1672,941);browser('set','media','light');browser('open','http://localhost:3000/home');browser('wait','.live-home')
browser('eval','localStorage.setItem("knoux.motion",JSON.stringify({quality:"balanced",eyes:.85,particles:.5,performance:false,reducedSensory:false}));location.reload()');browser('wait','.live-home')
browser('eval','(()=>{for(const logo of document.querySelectorAll(".stag-emblem")){const a=logo.querySelector("img").getBoundingClientRect(),b=logo.querySelector("svg").getBoundingClientRect();for(const k of ["left","top","width","height"])if(Math.abs(a[k]-b[k])>.5)throw Error("eye overlay bounds "+k)}return "PASS"})()')
browser('click','.live-preview-controls button:last-of-type');browser('wait',1700)
off=out/'eyes-off.png';browser('screenshot','.live-stag-stage .stag-emblem',off)
browser('click','.live-preview-controls button:last-of-type');browser('wait',2400)
on=out/'eyes-on.png';browser('screenshot','.live-stag-stage .stag-emblem',on)
dark,bright=pixels(off),pixels(on)
for eye in ['leftEye','rightEye']:assert bright[eye]-dark[eye]>40,(eye,dark,bright)
asset=pathlib.Path('src/assets/knoux-stag.png');digest=hashlib.sha256(asset.read_bytes()).hexdigest();assert digest=='6b054a6815726ee545b0d935cf851fb751a44b3dc8505a68066e438bec004f68'
report={'generatedBy':'CodeRabbit','method':'Actual cropped browser PNGs; 3x3 samples at original eye centers; image/SVG bounds checked on all Home logo instances.','off':dark,'on':bright,'assetSha256':digest,'limits':'Small-region luminance proof, not subjective visual approval or Windows runtime.'}
(out/'eye-pixel-observations.json').write_text(json.dumps(report,indent=2))
print('PASS: both rendered eye cores brighten by >40 luminance units; source PNG unchanged; actual image/SVG bounds aligned.',json.dumps(report))
