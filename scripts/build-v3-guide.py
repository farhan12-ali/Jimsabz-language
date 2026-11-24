"""Build the offline HTML language guide; no runtime dependency is required."""
from pathlib import Path
import html,re
root=Path(__file__).resolve().parents[1]
source=(root/'docs/V3-LANGUAGE.md').read_text().replace('| ya / || |','| ya / &#124;&#124; |')
def inline(s):
 s=html.escape(html.unescape(s));s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s);return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
blocks=[];lines=source.splitlines();i=0
while i<len(lines):
 line=lines[i]
 if not line.strip():i+=1;continue
 if line.startswith('```'):
  code=[];i+=1
  while i<len(lines)and not lines[i].startswith('```'):code.append(lines[i]);i+=1
  blocks.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
 if line.startswith('#'):
  level=len(line)-len(line.lstrip('#'));blocks.append(f'<h{level}>'+inline(line[level:].strip())+f'</h{level}>');i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines)and lines[i].startswith('|'):
   row=[s.strip()for s in lines[i].strip('|').split('|')]
   if not all(re.fullmatch('[-: ]+',s)for s in row):rows.append(row)
   i+=1
  blocks.append('<div class="table"><table>'+''.join('<tr>'+''.join(('<th>'if j==0 else'<td>')+inline(cell)+('</th>'if j==0 else'</td>')for cell in row)+'</tr>'for j,row in enumerate(rows))+'</table></div>');continue
 paragraph=[line];i+=1
 while i<len(lines)and lines[i].strip()and not lines[i].startswith(('#','|','```')):paragraph.append(lines[i]);i+=1
 blocks.append('<p>'+inline(' '.join(paragraph))+'</p>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jimsabz v3 language guide</title><style>body{margin:0;background:#11131e;color:#e4e1ef;font:16px/1.65 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:36px 24px}h1,h2{line-height:1.25;letter-spacing:-.025em}h1{font-size:32px}h2{margin-top:48px;color:#c5b3ff}code{font:14px ui-monospace,monospace;color:#cbbfff}pre{padding:20px;background:#1b1c2c;border:1px solid #39334e;overflow:auto;border-radius:8px}td,th{padding:12px 16px;border-bottom:1px solid #39334e;text-align:left;vertical-align:top}th{background:#28233d}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:15px}p{max-width:90ch}a{color:#c5b3ff}</style><main><a href="../index.html">Open Jimsabz Studio</a>'''+''.join(blocks)+'</main></html>'
(root/'studio/core/v3-guide.html').write_text(page)
