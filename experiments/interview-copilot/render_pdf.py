"""Render private archive text from stdin to PDF stdout; no network or shell."""
import io
import json
import os
import sys
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


def render(payload):
    font_path = os.environ.get('INTERVIEW_PDF_FONT', 'C:/Windows/Fonts/simsun.ttc')
    pdfmetrics.registerFont(TTFont('ArchiveCN', font_path, subfontIndex=0))
    base = dict(fontName='ArchiveCN', wordWrap='CJK', alignment=TA_LEFT,
                splitLongWords=True, textColor=colors.HexColor('#253c35'))
    body = ParagraphStyle('Body', fontSize=10.5, leading=18, spaceAfter=6, **base)
    title = ParagraphStyle('Title', fontSize=25, leading=34, spaceAfter=20, **base)
    section = ParagraphStyle('Section', fontSize=16, leading=24, spaceBefore=20,
                             spaceAfter=12, keepWithNext=True, **base)
    sub = ParagraphStyle('Sub', fontSize=12, leading=20, spaceBefore=12,
                         spaceAfter=8, keepWithNext=True, **base)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=48, leftMargin=48,
                            topMargin=56, bottomMargin=54, title='面试记录',
                            author='Interview Copilot')
    story = []
    for line in payload['content'].splitlines():
        if not line.strip():
            story.append(Spacer(1, 3))
            continue
        style = body
        if line.startswith('### '):
            style, line = sub, line[4:]
        elif line.startswith('## '):
            style, line = section, line[3:]
        elif line.startswith('# '):
            style, line = title, line[2:]
        # Escape every user-supplied character before reportlab's XML-like parser.
        story.append(Paragraph(escape(line.strip()), style))

    def frame(canvas, document):
        canvas.saveState()
        canvas.setFont('ArchiveCN', 8)
        canvas.setFillColor(colors.HexColor('#698074'))
        canvas.drawString(48, A4[1] - 30, 'MFIN OS / INTERVIEW COPILOT')
        canvas.setStrokeColor(colors.HexColor('#dbe3dc'))
        canvas.line(48, 40, A4[0] - 48, 40)
        canvas.drawString(48, 26, '私有面试记录 · AI 内容状态以正文标注为准')
        canvas.drawRightString(A4[0] - 48, 26, f'第 {document.page} 页')
        canvas.restoreState()

    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()


if __name__ == '__main__':
    payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    sys.stdout.buffer.write(render(payload))
