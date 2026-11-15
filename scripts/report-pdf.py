"""Render archived report JSON from stdin to an A4 PDF on stdout. No network or content logs."""
import sys, json, io
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib import colors
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
b=json.load(sys.stdin)
buffer=io.BytesIO()
doc=SimpleDocTemplate(buffer,pagesize=(595,842),rightMargin=48,leftMargin=48,topMargin=46,bottomMargin=48,title=('日报' if b['type']=='daily' else '周报')+' '+b['date'],author='MFin OS')
def style(size=11,leading=19,color='#203b31'):
 return ParagraphStyle('report',fontName='STSong-Light',fontSize=size,leading=leading,textColor=colors.HexColor(color),wordWrap='CJK',spaceAfter=8)
def para(text,s=None):return Paragraph(escape(str(text)).replace('\n','<br/>'),s or style())
story=[para('MFin OS · '+('日报' if b['type']=='daily' else '周报'),style(25,34)),para(b['date']+' · 北京 / 香港时间',style(11,18,'#53665f')),Spacer(1,12),para(b['summary'],style(12,22)),Spacer(1,14)]
tints={'green':'#eaf2ed','blue':'#edf1f7','amber':'#f7f0e4','neutral':'#f1f2ee'}
for s in b['sections']:
 heading=Table([[para(s['title'],style(15,23))]],colWidths=[499]);heading.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor(tints[s['tone']])),('LEFTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
 entries=[]
 for item in s['items']:
  title=para(item['title'],style(12,21));title.keepWithNext=True
  detail=para(item['detail']);detail.keepWithNext=True
  entries.extend([title,detail,para('依据：'+' / '.join(item['sources']),style(8,13,'#52655c')),Spacer(1,9)])
 if not entries:entries=[para('此范围内暂无可总结的记录。')]
 heading.keepWithNext=True
 gap=Spacer(1,10);gap.keepWithNext=True
 story.append(heading);story.append(gap);story.extend(entries);story.append(Spacer(1,12))
used={ref for s in b['sections'] for i in s['items'] for ref in i['sources']}
heading=para('来源索引',style(14,22));heading.keepWithNext=True;story.append(heading)
refs=[para(e['id']+' · '+e['label'],style(8,13,'#52655c')) for e in b['evidence'] if e['id'] in used]
if refs:
 rows=[[refs[i],refs[i+1] if i+1<len(refs) else ''] for i in range(0,len(refs),2)]
 table=Table(rows,colWidths=[249,249]);table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),14),('BOTTOMPADDING',(0,0),(-1,-1),4)]));story.append(table)
def footer(c,doc):
 c.setFont('STSong-Light',8);c.setFillColor(colors.HexColor('#52655c'));c.drawString(48,28,'MFin OS · DeepSeek · 截止 '+b['cutoff'][:19].replace('T',' ')+' UTC');c.drawRightString(547,28,str(doc.page))
doc.build(story,onFirstPage=footer,onLaterPages=footer)
sys.stdout.buffer.write(buffer.getvalue())
