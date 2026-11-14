import io,json,sys,zipfile
from xml.etree import ElementTree as ET

def parse(kind,data):
    if kind=='pdf':
        if not data.startswith(b'%PDF-'): raise ValueError('FILE_TYPE_MISMATCH')
        import pymupdf
        with pymupdf.open(stream=data,filetype='pdf') as doc:
            if doc.needs_pass: raise ValueError('PDF_ENCRYPTED')
            if len(doc)>200: raise ValueError('PDF_TOO_MANY_PAGES')
            sections=[{'page':i+1,'text':page.get_text(sort=True)} for i,page in enumerate(doc)]
    elif kind=='docx':
        if not data.startswith(b'PK'): raise ValueError('FILE_TYPE_MISMATCH')
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist())>30_000_000 or len(z.infolist())>3000: raise ValueError('DOCX_TOO_COMPLEX')
            if 'word/document.xml' not in z.namelist() or '[Content_Types].xml' not in z.namelist(): raise ValueError('FILE_TYPE_MISMATCH')
            xml=z.read('word/document.xml')
            if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper(): raise ValueError('DOCX_UNSAFE_XML')
            root=ET.fromstring(xml);ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            sections=[{'paragraph':i+1,'text':''.join(t.text or '' for t in p.iter(ns+'t'))} for i,p in enumerate(root.iter(ns+'p'))]
    else: raise ValueError('UNSUPPORTED_TYPE')
    if sum(len(p['text']) for p in sections)>500000: raise ValueError('TEXT_TOO_LARGE')
    if not ''.join(p['text'] for p in sections).strip(): raise ValueError('NO_TEXT_OR_SCANNED_PDF')
    return {'sections':sections,'parser':'pymupdf' if kind=='pdf' else 'docx-xml-v1'}

try:
    result=parse(sys.argv[1],sys.stdin.buffer.read());sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode('utf8'))
except Exception as e:
    code=str(e) if isinstance(e,ValueError) else 'PARSE_FAILED'
    sys.stdout.buffer.write(json.dumps({'error':code}).encode('utf8'));sys.exit(1)
