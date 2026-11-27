# crop each op screenshot to the CARPET window and tile into one contact sheet
import zlib,struct,sys
def readpng(f):
    d=open(f,'rb').read();p=8;idat=b'';w=h=0
    while p<len(d):
        l=struct.unpack('>I',d[p:p+4])[0];t=d[p+4:p+8];c=d[p+8:p+8+l];p+=12+l
        if t==b'IHDR':w,h=struct.unpack('>II',c[:8])
        if t==b'IDAT':idat+=c
    raw=zlib.decompress(idat);s=w*3+1
    return w,h,[raw[y*s+1:(y+1)*s] for y in range(h)]
x0,y0,cw,chh=188,94,196,156
tiles=[]
for m in range(6):
    w,h,rows=readpng(__import__('os').path.join(__import__('os').path.dirname(__file__) or '.', 'out', f'app-WASM-op{m}.png'))
    tiles.append([r[x0*3:(x0+cw)*3] for r in rows[y0:y0+chh]])
W,H=cw*3,chh*2;out=[]
for ty in range(2):
    for y in range(chh):
        out.append(b''.join(tiles[ty*3+tx][y] for tx in range(3)))
raw=b''.join(b'\x00'+r for r in out)
def ch(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
open(__import__('os').path.join(__import__('os').path.dirname(__file__) or '.', 'out', 'carpet-sheet.png'),'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',W,H,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw,9))+ch(b'IEND',b''))
