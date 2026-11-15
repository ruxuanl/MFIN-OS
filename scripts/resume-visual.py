import sys,json,base64,io,zipfile,xml.etree.ElementTree as ET
raw=sys.stdin.buffer.read(10*1024*1024+1)
if len(raw)>10*1024*1024: raise ValueError('file_too_large')
if sys.argv[1]=='pdf':
 import pymupdf
 doc=pymupdf.open(stream=raw,filetype='pdf')
 if doc.is_encrypted or len(doc)>80: raise ValueError('unsupported_pdf')
 images=[]
 for page in list(doc.pages(0,min(len(doc),3))):
  scale=min(1.6,1600/max(page.rect.width,page.rect.height))
  images.append('data:image/png;base64,'+base64.b64encode(page.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False).tobytes('png')).decode('ascii'))
 print(json.dumps({'images':images,'layoutText':f'实际PDF页面图：共{len(doc)}页，本次评估前{len(images)}页。超出部分未做视觉核验。'}))
else:
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  entry=z.getinfo('word/document.xml')
  if entry.file_size>6*1024*1024: raise ValueError('docx_too_large')
  root=ET.fromstring(z.read(entry))
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  keys=['pgSz','pgMar','sz','spacing','jc','rFonts','cols']
  attrs={k:[{a.split('}')[-1]:v for a,v in e.attrib.items()} for e in root.findall('.//w:'+k,ns)][:60] for k in keys}
  print(json.dumps({'images':[],'layoutText':'DOCX格式属性（非最终渲染截图，不能判断溢出或精确视觉对齐）：'+json.dumps(attrs,ensure_ascii=False)},ensure_ascii=False))
