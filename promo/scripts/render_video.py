#!/usr/bin/env python3
"""Render the fully art-directed portrait promo from deterministic Pillow scenes."""
from pathlib import Path
import math, subprocess, sys, wave, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'exports'; PREVIEW = ROOT / 'previews'; AUDIO = ROOT / 'assets/audio'
W, H = 1080, 1920
FPS_PREVIEW, FPS_FINAL = 60, 60
DURATION = 45
BG = '#F8F5ED'; PURPLE = '#7047BF'; PURPLE_DEEP = '#6335AD'; LAV = '#EEE4FA'
INK = '#30283D'; MUTED = '#736A7E'; GREEN = '#E7F3E8'; BORDER = '#E7DED2'; WHITE = '#FFFFFF'
FONT_REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'

def font(px, bold=False): return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, px)
def ease(x):
    x = max(0., min(1., x)); return 1 - (1 - x) ** 4
def clamp01(x): return max(0., min(1., x))

def rgba(color, a=255):
    from PIL import ImageColor
    return ImageColor.getrgb(color) + (int(max(0,min(255,a))),)

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(tuple(map(int,box)), radius=radius, fill=fill, outline=outline, width=width)

def center_text(draw, xy, text, f, fill, anchor='mm', **kw):
    draw.text(xy, text, font=f, fill=fill, anchor=anchor, **kw)

def wrap_lines(draw, text, f, max_width):
    lines=[]
    for block in text.split('\n'):
        line=''
        for ch in block:
            candidate=line+ch
            if line and draw.textlength(candidate,font=f)>max_width:
                lines.append(line); line=ch
            else: line=candidate
        if line: lines.append(line)
    return lines

def paragraph(draw, xy, text, f, fill, max_width, leading=1.55, align='left'):
    x,y=xy; lines=wrap_lines(draw,text,f,max_width); step=int(f.size*leading)
    for i,line in enumerate(lines):
        xx=x
        if align=='center': xx=x-draw.textlength(line,font=f)/2
        elif align=='right': xx=x-draw.textlength(line,font=f)
        draw.text((xx,y+i*step),line,font=f,fill=fill)
    return y+len(lines)*step

def background(seed=0):
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32); yy/=H; xx/=W
    top=np.array([250,248,242],np.float32); bot=np.array([247,243,235],np.float32)
    grad=top[None,None,:]*(1-yy[:,:,None])+bot[None,None,:]*yy[:,:,None]
    for cx,cy,rgb,amp,sigma in [(.79,.19,(235,223,250),.23,.25),(.12,.72,(255,255,255),.30,.27),(.87,.83,(228,241,227),.19,.22)]:
        d=((xx-cx)**2+((yy-cy)*.77)**2)/(sigma*sigma)
        glow=np.exp(-d*2.7)[:,:,None]*amp
        grad=grad*(1-glow)+np.array(rgb,np.float32)[None,None,:]*glow
    # Fixed, almost invisible paper grain prevents flat digital color fields.
    rng=np.random.default_rng(20261003+seed); noise=rng.normal(0,.52,(H,W,1)).astype(np.float32)
    arr=np.clip(grad+noise,0,255).astype(np.uint8)
    return Image.fromarray(arr,'RGB').convert('RGBA')

def spark(draw, cx, cy, r=20, color=PURPLE):
    pts=[(cx,cy-r),(cx+r*.16,cy-r*.16),(cx+r,cy),(cx+r*.16,cy+r*.16),(cx,cy+r),(cx-r*.16,cy+r*.16),(cx-r,cy),(cx-r*.16,cy-r*.16)]
    draw.polygon(pts,fill=color)

def brand_lockup(draw, y=188, small=False):
    scale=.7 if small else 1
    x=540; s=int(54*scale)
    rounded(draw,(x-212*scale,y-s/2,x-212*scale+s,y+s/2),int(17*scale),PURPLE)
    spark(draw,x-212*scale+s/2,y,16*scale,WHITE)
    draw.text((x-139*scale,y), '测测be', font=font(int(39*scale),True), fill=INK, anchor='lm')
    draw.line((x-21*scale,y-s*.46,x-21*scale,y+s*.46), fill=BORDER,width=max(1,int(2*scale)))
    draw.text((x+1*scale,y), '好奇有答案',font=font(int(21*scale)),fill=MUTED,anchor='lm')

def card_shell(draw, x=118, y=398, w=844, h=1105, fill=WHITE, radius=45):
    # Soft, warm offset shadow plus hairline edge.
    rounded(draw,(x+1,y+19,x+w+2,y+h+19),radius, '#E7DED2')
    rounded(draw,(x,y,x+w,y+h),radius,fill,outline='#E8DFD4',width=2)

def header(draw, title, subtitle, y=465):
    spark(draw,162,y+20,15)
    draw.text((197,y),title,font=font(30,True),fill=INK,anchor='lm')
    if subtitle: draw.text((162,y+59),subtitle,font=font(22),fill=MUTED,anchor='lm')

def base_card_scene(seed, title, subtitle=''):
    im=background(seed); d=ImageDraw.Draw(im)
    brand_lockup(d,178,True); card_shell(d)
    header(d,title,subtitle)
    return im,d

def make_cover():
    im=background(1); d=ImageDraw.Draw(im); brand_lockup(d,200)
    rounded(d,(370,335,710,391),27,LAV)
    spark(d,407,363,12)
    d.text((438,363),'给好奇心一点自由',font=font(22,True),fill=PURPLE,anchor='lm')
    center_text(d,(540,655),'今天，你好奇什么？',font(73,True),INK)
    # Subtle orbit and a single violet curiosity dot.
    d.ellipse((508,805,572,869),fill=PURPLE)
    d.ellipse((529,826,551,848),fill='#B899E8')
    for angle in [-2.2,-1.1,0,1.05,2.12]:
        x=540+225*math.cos(angle); y=837+225*math.sin(angle)
        rr=5 if angle else 9
        d.ellipse((x-rr,y-rr,x+rr,y+rr),fill='#CAB3EA')
    paragraph(d,(540,1165),'关于知识，关于关系，\n也关于自己。',font(34),MUTED,760,1.7,'center')
    rounded(d,(222,1435,858,1523),43,PURPLE)
    spark(d,296,1479,17,WHITE); center_text(d,(572,1480),'从一个问题开始',font(30,True),WHITE)
    return im

def make_questions():
    scenes=[]
    questions=[
      ('知识测试','我的中国历史知识怎么样？','从熟悉的历史问题开始，\n看看知识地图。','01 / 03'),
      ('关系探索','我更适合怎样的相处方式？','发现自己的沟通偏好，\n让相处更自在。','02 / 03'),
      ('认识自己','我喜欢什么样的生活？','从日常选择出发，\n找到让你舒适的节奏。','03 / 03')]
    for i,(tag,q,desc,num) in enumerate(questions):
        im,d=base_card_scene(10+i,'一个问题，也可以很不一样','知识 · 关系 · 兴趣')
        rounded(d,(162,622,918,1176),34,LAV if i!=2 else '#F0E9F8')
        rounded(d,(210,676,390,725),22,WHITE)
        center_text(d,(300,700),tag,font(21,True),PURPLE)
        paragraph(d,(540,837),q,font(42,True),INK,640,1.42,'center')
        paragraph(d,(540,1005),desc.replace('\n',''),font(25),MUTED,630,1.7,'center')
        d.line((220,1260,860,1260),fill=BORDER,width=2)
        d.text((224,1315),'今天，你好奇什么？',font=font(24),fill=MUTED,anchor='lm')
        d.text((855,1315),num,font=font(22,True),fill=PURPLE,anchor='rm')
        scenes.append(im)
    return scenes

def make_composer():
    im,d=base_card_scene(20,'把一个问题，变成一次探索','写下好奇的主题，让 AI 帮你构建测试')
    rounded(d,(162,622,918,1118),30,WHITE,outline=BORDER,width=2)
    spark(d,204,676,12)
    d.text((235,676),'说说你想测什么',font=font(24,True),fill=INK,anchor='lm')
    paragraph(d,(205,765),'测试我理想的相处方式',font(32),INK,665,1.5,'left')
    d.line((205,1029,874,1029),fill=BORDER,width=2)
    for i,(label,w) in enumerate([('10 道题',185),('简体中文',205),('偏好探索',190)]):
        x=162+ i*250
        d.text((x,1166),['题目数量','测试语言','测试模式'][i],font=font(18),fill=MUTED,anchor='lm')
        rounded(d,(x,1200,x+w,1260),17,'#FAF8F2',outline=BORDER,width=1)
        d.text((x+17,1230),label,font=font(19),fill=INK,anchor='lm')
    rounded(d,(162,1330,918,1422),22,PURPLE)
    spark(d,421,1376,15,WHITE)
    center_text(d,(575,1377),'AI 生成测试',font(29,True),WHITE)
    return im

def make_question_card(index):
    qs=[
      ('题目 01','空闲的一天，你更想怎样度过？',['和朋友聊聊天','独自散步，慢慢放松','找一件新鲜事试试']),
      ('题目 05','与朋友相处时，你更看重什么？',['能坦诚地表达想法','彼此保留一点空间','一起做喜欢的事情']),
      ('题目 10','面对新的计划，你通常会？',['先定一个清晰方向','边走边看看感觉','拉上朋友一起尝试'])]
    idx,title,opts=qs[index]
    im,d=base_card_scene(30+index,'认真回答。慢慢发现。','每个选择，都是认识自己的一个线索')
    # progress and question header
    d.text((162,625),idx,font=font(22,True),fill=PURPLE,anchor='lm')
    d.text((918,625),'偏好探索',font=font(20),fill=MUTED,anchor='rm')
    rounded(d,(162,671,918,683),6,'#EEE8F4')
    rounded(d,(162,671,162+int(756*(.12+.38*index)),683),6,PURPLE)
    paragraph(d,(162,759),title,font(37,True),INK,745,1.38,'left')
    for j,opt in enumerate(opts):
        y=897+j*128
        bg=LAV if j==([1,0,2][index]) else '#FBFAF7'
        border=PURPLE if bg==LAV else BORDER
        rounded(d,(162,y,918,y+96),22,bg,outline=border,width=2)
        rounded(d,(190,y+27,232,y+69),13,WHITE if bg==LAV else BG,outline=border,width=2)
        center_text(d,(211,y+48),chr(65+j),font(18,True),PURPLE)
        d.text((261,y+48),opt,font=font(23),fill=INK,anchor='lm')
    d.text((162,1335),'选择最接近你真实感受的一项',font=font(20),fill=MUTED,anchor='lm')
    rounded(d,(162,1383,918,1450),19,PURPLE)
    center_text(d,(540,1417),'继续',font(24,True),WHITE)
    return im

def make_report():
    im=background(41); d=ImageDraw.Draw(im); brand_lockup(d,178,True)
    card_shell(d,93,338,894,1255,WHITE,46)
    rounded(d,(142,386,330,437),24,LAV)
    center_text(d,(236,411),'偏好探索',font(20,True),PURPLE)
    d.text((142,497),'理想相处偏好测试',font=font(26),fill=MUTED,anchor='lm')
    paragraph(d,(142,567),'温柔回应 ·\n自然相处型',font(49,True),INK,775,1.25,'left')
    # traits card
    rounded(d,(142,747,938,967),26,LAV)
    d.text((180,791),'你的相处倾向',font=font(21,True),fill=PURPLE,anchor='lm')
    paragraph(d,(180,850),'你更看重真诚的回应，也喜欢自在、有空间的相处方式。',font(24),INK,708,1.55,'left')
    # no numerical scores; qualitative chips only
    chips=[('真诚回应',142,304),('自然相处',323,485),('保留空间',504,666)]
    for txt,x1,x2 in chips:
        rounded(d,(x1,1007,x2,1060),23,WHITE,outline=BORDER,width=1)
        center_text(d,((x1+x2)//2,1034),txt,font(19,True),PURPLE)
    d.text((142,1120),'探索建议',font=font(25,True),fill=INK,anchor='lm')
    rounded(d,(142,1166,938,1388),26,GREEN)
    paragraph(d,(180,1211),'试着说出自己的期待，也为彼此保留自在的空间。',font(23),INK,712,1.62,'left')
    d.text((142,1452),'这份结果用于自我探索与参考',font=font(19),fill=MUTED,anchor='lm')
    return im

def make_share(qrimg):
    im=background(55); d=ImageDraw.Draw(im); brand_lockup(d,178,True)
    card_shell(d,116,337,848,1268,WHITE,44)
    # QR is at the TOP, with correct home-page CTA.
    d.rounded_rectangle((158,383,922,628),radius=29,fill='#FBFAF7')
    im.alpha_composite(qrimg,(190,408))
    d.text((398,438),'扫码开启探索',font=font(26,True),fill=PURPLE,anchor='lm')
    d.text((398,491),'ccb.h666h.com',font=font(22),fill=MUTED,anchor='lm')
    d.text((398,539),'把好奇变成一次发现',font=font(19),fill=MUTED,anchor='lm')
    d.line((158,675,922,675),fill=BORDER,width=2)
    d.text((158,723),'测测be · 偏好探索',font=font(21,True),fill=PURPLE,anchor='lm')
    paragraph(d,(158,781),'温柔回应 · 自然相处型',font(34,True),INK,748,1.35,'left')
    paragraph(d,(158,873),'更看重真诚的回应，也喜欢自在、有空间的相处方式。',font(22),MUTED,742,1.6,'left')
    d.text((158,1020),'认识自己的三个线索',font=font(23,True),fill=INK,anchor='lm')
    for j,(a,b) in enumerate([('01','真诚回应'),('02','自然相处'),('03','保留空间')]):
        y=1071+j*105
        rounded(d,(158,y,922,y+78),19,LAV if j==1 else '#FBFAF7',outline='#E9E1F0',width=1)
        d.text((187,y+39),a,font=font(17,True),fill=PURPLE,anchor='lm')
        d.text((247,y+39),b,font=font(21,True),fill=INK,anchor='lm')
        d.text((886,y+39),'✦',font=font(20),fill=PURPLE,anchor='mm')
    d.text((158,1434),'测试结果仅供探索与参考',font=font(18),fill=MUTED,anchor='lm')
    return im

def make_end():
    im=background(70);d=ImageDraw.Draw(im)
    # Central, clean brand lockup with small ambient orbit.
    for r,a in [(250,'#EFE7F6'),(198,'#F2ECF7')]:
        d.ellipse((540-r,725-r,540+r,725+r),outline=a,width=2)
    rounded(d,(386,581,694,889),83,PURPLE)
    spark(d,540,735,73,WHITE)
    center_text(d,(540,1007),'测测be',font(74,True),INK)
    center_text(d,(540,1111),'给好奇，一点答案',font(34,True),PURPLE)
    rounded(d,(300,1220,780,1302),41,WHITE,outline=BORDER,width=1)
    center_text(d,(540,1262),'ccb.h666h.com',font(28,True),INK)
    center_text(d,(540,1400),'来测测，发现不一样的自己。',font(24),MUTED)
    return im

def make_poster():
    """Standalone campaign cover, distinct from the final video end card."""
    im=background(90); d=ImageDraw.Draw(im); brand_lockup(d,205)
    # Floating violet result card is the visual anchor, with generous safe margins.
    rounded(d,(108,492,972,1392),55,'#E7DED2')
    rounded(d,(108,473,972,1373),55,PURPLE)
    spark(d,193,579,18,WHITE)
    d.text((234,579),'给好奇心一点自由',font=font(25,True),fill='#F8F5ED',anchor='lm')
    center_text(d,(540,802),'你的小小好奇，',font(62,True),WHITE)
    center_text(d,(540,906),'值得一个答案。',font(62,True),WHITE)
    d.line((278,1004,802,1004),fill='#9B79D1',width=2)
    center_text(d,(540,1080),'把一个问题，变成一次探索。',font(29),WHITE)
    # Abstract, quiet question-orbit motif.
    for i,(cx,cy,r) in enumerate([(355,1200,23),(438,1231,13),(540,1192,28),(654,1235,15),(741,1196,21)]):
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#A88AD6' if i%2==0 else '#C4AFE4')
    rounded(d,(295,1482,785,1570),43,WHITE,outline=BORDER,width=1)
    center_text(d,(540,1526),'ccb.h666h.com',font(30,True),INK)
    center_text(d,(540,1675),'知识 · 兴趣 · 关系 · 自我探索',font(24),MUTED)
    return im

def make_qr():
    qrcode.make('https://ccb.h666h.com').save(PREVIEW/'qr-home.png')
    q=Image.open(PREVIEW/'qr-home.png').convert('RGBA')
    return q.resize((190,190),Image.Resampling.NEAREST)

def subtitle(draw, t):
    entries=[(0.45,2.96,'今天，你好奇什么？'),(4.25,8.48,'关于知识，关于关系，也关于自己。'),
             (10.35,13.63,'把一个问题，变成一次探索。'),(16.15,19.12,'认真回答，慢慢发现。'),
             (23.2,26.78,'看见你的倾向，也看见更多可能。'),(32.15,35.32,'把这份发现，分享给朋友。'),
             (38.05,42.06,'测测be。给好奇，一点答案。')]
    line=next((txt for a,b,txt in entries if a<=t<=b),None)
    if not line: return
    # Single soft caption plate in the safe lower area.
    plate=(125,1603,955,1695)
    rounded(draw,plate,29,(255,255,255,235),outline=(232,223,212,235),width=1)
    center_text(draw,(540,1649),line,font(29,True),INK)

def smoothstep(x):
    x=clamp01(x); return x*x*(3-2*x)

def scene_at(t,scenes):
    # Weighted dissolve over adjacent matching layouts. 0.72 sec, smooth and restrained.
    intervals=[(0,4),(4,10),(10,16),(16,23),(23,32),(32,38),(38,45)]
    idx=next((i for i,(a,b) in enumerate(intervals) if a<=t<b),6)
    a,b=intervals[idx]; local=t-a
    if idx==1:
        pos=local/2.0; sub=int(min(2,pos)); frac=pos-sub
        im=scenes['questions'][sub]
        if sub<2 and frac>0.66:
            im=Image.blend(im,scenes['questions'][sub+1],smoothstep((frac-0.66)/0.34))
    elif idx==3:
        pos=local/2.4; sub=int(min(2,pos)); frac=pos-sub
        im=scenes['quiz'][sub]
        if sub<2 and frac>0.72:
            im=Image.blend(im,scenes['quiz'][sub+1],smoothstep((frac-0.72)/0.28))
    else: im=scenes[['cover','composer','result','share','end'][{0:0,2:1,4:2,5:3,6:4}[idx]]]
    # Gentle 1% camera drift on the full scene; preserve text clarity.
    p=local/max(.01,b-a)
    scale=1+0.009*math.sin(math.pi*p)
    if abs(scale-1)>.0001:
        nw=int(W*scale); nh=int(H*scale)
        enlarged=im.resize((nw,nh),Image.Resampling.BICUBIC)
        im=enlarged.crop(((nw-W)//2,(nh-H)//2,(nw+W)//2,(nh+H)//2))
    if idx<6 and b-t<0.74:
        nextidx=idx+1
        nt=t-b
        if nextidx==1: target=scenes['questions'][0]
        elif nextidx==3: target=scenes['quiz'][0]
        else: target=scenes[['cover','composer','result','share','end'][{0:0,2:1,4:2,5:3,6:4}[nextidx]]]
        alpha=smoothstep((0.74-(b-t))/0.74)
        im=Image.blend(im,target,alpha)
    # Scene 4 result content unfolds in a clean, controlled reveal.
    if idx==4:
        reveal=clamp01(local/1.4)
        if reveal<1:
            im=Image.blend(background(41),im,ease(reveal))
    # Slightly lift the ending mark in, then hold it still for the final 3 sec.
    if idx==6 and local<0.8:
        im=Image.blend(background(70),im,ease(local/.8))
    return im

def build_srt():
    rows=[('00:00:00,450','00:00:02,960','今天，你好奇什么？'),
          ('00:00:04,250','00:00:08,480','关于知识，关于关系，也关于自己。'),
          ('00:00:10,350','00:00:13,630','把一个问题，变成一次探索。'),
          ('00:00:16,150','00:00:19,120','认真回答，慢慢发现。'),
          ('00:00:23,200','00:00:26,780','看见你的倾向，也看见更多可能。'),
          ('00:00:32,150','00:00:35,320','把这份发现，分享给朋友。'),
          ('00:00:38,050','00:00:42,060','测测be。给好奇，一点答案。')]
    return '\n\n'.join(f'{i}\n{a} --> {b}\n{txt}' for i,(a,b,txt) in enumerate(rows,1))+'\n'

def ffmpeg_mix():
    voice_parts=[]; inputs=[]
    offsets=[0.45,4.25,10.35,16.15,23.20,32.15,38.05]
    for i in range(1,8): inputs += ['-i',str(AUDIO/f'voice/line-{i:02}.mp3')]
    inputs += ['-i',str(AUDIO/'music/original-ambient.wav')]
    # Fades on each VO phrase prevent a hard encoder boundary. Individual TTS clips are MP3.
    chains=[]
    for i,ms in enumerate(offsets):
        chains.append(f'[{i}:a]aresample=48000,adelay={int(ms*1000)}:all=1,volume=1.0[v{i}]')
    vo_labels=''.join(f'[v{i}]' for i in range(7))
    chains.append(f'{vo_labels}amix=inputs=7:normalize=0,alimiter=limit=0.92:attack=10:release=80,asplit=2[voice_sc][voice_mix]')
    chains.append('[7:a]volume=0.26[music]')
    chains.append('[voice_sc]apad=whole_dur=45[voice_sc_full]')
    chains.append('[music][voice_sc_full]sidechaincompress=threshold=0.025:ratio=5:attack=80:release=550:makeup=1[ducked]')
    sfx=[('sfx/tap.wav',10.48),('sfx/bloom.wav',13.88),('sfx/select.wav',17.36),('sfx/select.wav',19.15),('sfx/select.wav',20.62),('sfx/soft-swish.wav',23.2),('sfx/soft-swish.wav',32.14)]
    for j,(file,sec) in enumerate(sfx):
        inputs += ['-i',str(AUDIO/file)]
        n=8+j; chains.append(f'[{n}:a]adelay={int(sec*1000)}:all=1,volume=0.38[s{j}]')
    all_sfx=''.join(f'[s{i}]' for i in range(len(sfx)))
    chains.append(f'[voice_mix][ducked]{all_sfx}amix=inputs={2+len(sfx)}:normalize=0,alimiter=limit=0.95:attack=5:release=80,atrim=duration=45,afade=t=out:st=43.6:d=1.4,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true[aout]')
    # Master isolated VO to PCM using the same timings, at full clarity.
    vo_mix=OUT/'测测be-旁白完整版.wav'
    ff=['ffmpeg','-y',*inputs,'-filter_complex',';'.join(chains),'-map','[aout]','-c:a','pcm_s24le','-ar','48000','-ac','2',str(OUT/'测测be-配乐混音母带.wav')]
    mix=subprocess.run(ff,text=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    if mix.returncode:
        raise RuntimeError(mix.stderr[-9000:])
    # Isolated VO has one dry track, delayed to match picture.
    parts=[]
    voice_inputs=['ffmpeg','-y']
    for i in range(1,8): voice_inputs+=['-i',str(AUDIO/f'voice/line-{i:02}.mp3')]
    filt=[]
    for i,ms in enumerate(offsets): filt.append(f'[{i}:a]aresample=48000,adelay={int(ms*1000)}:all=1[v{i}]')
    filt.append(''.join(f'[v{i}]' for i in range(7))+'amix=inputs=7:normalize=0,apad=whole_dur=45,atrim=duration=45,alimiter=limit=0.94[vout]')
    dry=subprocess.run(voice_inputs+['-filter_complex',';'.join(filt),'-map','[vout]','-c:a','pcm_s24le','-ar','48000','-ac','2',str(vo_mix)],text=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    if dry.returncode:
        raise RuntimeError(dry.stderr[-5000:])

def main():
    OUT.mkdir(parents=True,exist_ok=True); PREVIEW.mkdir(parents=True,exist_ok=True)
    if '--cover-only' in sys.argv:
        make_poster().convert('RGB').save(OUT/'测测be-宣传封面.png',optimize=True)
        print(f'Cover updated: {OUT/"测测be-宣传封面.png"}')
        return
    qr=make_qr()
    scenes={'cover':make_cover(),'questions':make_questions(),'composer':make_composer(),
            'quiz':[make_question_card(i) for i in range(3)],'result':make_report(),
            'share':make_share(qr),'end':make_end()}
    # The standalone cover uses the campaign hook; the MP4 has a quieter logo ending.
    make_poster().convert('RGB').save(OUT/'测测be-宣传封面.png',optimize=True)
    (OUT/'测测be-给好奇一点答案.srt').write_text(build_srt(),encoding='utf-8')
    raw=PREVIEW/'picture-60fps.mp4'
    cmd=['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s:v',f'{W}x{H}','-r',str(FPS_PREVIEW),'-i','-','-an','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(raw)]
    if not raw.exists():
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
        total=int(DURATION*FPS_PREVIEW)
        for fi in range(total):
            t=fi/FPS_PREVIEW
            im=scene_at(t,scenes)
            d=ImageDraw.Draw(im,'RGBA'); subtitle(d,t)
            proc.stdin.write(np.asarray(im.convert('RGB'),dtype=np.uint8).tobytes())
            if fi%150==0: print(f'frames {fi}/{total}',flush=True)
        proc.stdin.close(); stderr=proc.stderr.read().decode('utf-8','replace'); status=proc.wait()
        if status: raise RuntimeError(stderr[-6000:])
    else:
        print(f'Reusing rendered picture draft: {raw}', flush=True)
    print('Picture draft rendered; mixing voice, original music and effects.',flush=True)
    ffmpeg_mix()
    final=OUT/'测测be-给好奇一点答案-竖屏完整版.mp4'
    # Encode the natively rendered 60fps picture; audio mix is exactly 45s.
    subprocess.run(['ffmpeg','-y','-i',str(raw),'-i',str(OUT/'测测be-配乐混音母带.wav'),'-vf','format=yuv420p','-fps_mode','cfr','-t','45','-c:v','libx264','-preset','medium','-crf','17','-c:a','aac','-b:a','224k','-ar','48000','-movflags','+faststart','-shortest',str(final)],check=True)
    print(f'Finished: {final}')
if __name__=='__main__': main()
