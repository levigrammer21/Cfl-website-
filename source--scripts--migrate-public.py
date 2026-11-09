"""Build the public import from the legacy CFL homepage and score page.
Pass locally downloaded HTML for the score page. No roster pages are fetched.
"""
import json, re, sys
from datetime import date
from pathlib import Path
from lxml import html

HOME='https://www.cfl1.org/'
SCORES=HOME+'pics-videos'
SCHEDULE=HOME+'schedule-and-results'
MAPS=HOME+'maps-1'
RULES=HOME+'rules'
PDF=HOME+'_files/ugd/0e61b4_cc69d1fb270048f4b8238b0595a4a1fc.pdf'
data={}
def add(kind,id,**fields):
    data.setdefault(kind,[]).append(dict(id=id,published=True,**fields))
    return data[kind][-1]

town_rows=[
('beggs','Beggs','Demons','South','#956119','Beggs High School','1201 W 9th St, Beggs, OK 74421'),
('chouteau','Chouteau','Wildcats','North','#984234','Chouteau','502 Whitaker Ave, Chouteau, OK 74337'),
('henryetta','Henryetta','Knights','South','#774a20','Henryetta','401–499 E Broadway St, Henryetta, OK 74437'),
('inola','Inola','Longhorns','North','#85414d','Inola High School','801 E Commercial St, Inola, OK 74036'),
('kellyville','Kellyville','Ponies','South','#4b3e85','Kellyville High School','14959 N Maple Dr, Kellyville, OK 74039'),
('liberty','Liberty','Tigers','North','#9c6531','Liberty','2727 E 201st St S, Mounds, OK 74047'),
('morris','Morris','Eagles','South','#955036','Morris High School','307 S 6th St, Morris, OK 74445'),
('okmulgee','Okmulgee','Bulldogs','South','#953d40','Okmulgee','699 E 12th St, Okmulgee, OK 74447'),
('regent','Regent','','North','#356771','Regent High School','8621 S Memorial Dr, Tulsa, OK 74133'),
('sperry','Sperry','Pirates','North','#254c82','Sperry','201 N 4th St, Sperry, OK 74073'),
('stroud','Stroud','Tigers','South','#284e94','Stroud','701–815 N 2nd Ave, Stroud, OK 74079'),
('victory','Victory Christian','Conquerors','North','#376782','Victory Christian School','7700 S Lewis Ave, Tulsa, OK 74136')]
towns={}
for id,name,mascot,conference,color,venue,address in town_rows:
    towns[id]=add('towns',id,name=name,mascot=mascot,color=color,source=RULES,active=True)
    add('venues',id,name=venue,town=id,address=address,source=MAPS)
for id,name in [('noah','NOAH'),('kiefer','Kiefer')]:
    towns[id]=add('towns',id,name=name,active=False,source=HOME)
confs={r[0]:r[3] for r in town_rows}
grades=['12','34','56']
names={'12':'Grades 1–2','34':'Grades 3–4','56':'Grades 5–6'}
for year in [2019,2020,2021,2022,2023,2024,2025,2026]:
    season=str(year)
    fields=dict(name=season+' Season',year=year,status='active' if year==2026 else 'archived',source=PDF if year==2026 else HOME)
    if year==2026:
        fields.update(start='2026-08-22',end='2026-11-07',conferences=['North','South'],scheduleMode='town',breakers=['conference','conferenceHead','conferencePoints'],pointCap=8,overtimePoints=1,forfeitPolicy='unconfigured',rulesUrl=RULES,notes='Conference record, then conference head-to-head, then capped conference point differential. The published rules call for a coin flip for a remaining tie. One published forfeiture is excluded until the league confirms its standings treatment.')
    add('seasons',season,**fields)
    for i,g in enumerate(grades): add('divisions',f'{year}-{g}',name=names[g],season=season,order=i+1)
for year,winners in {
2019:['beggs','kellyville','henryetta'],2020:['morris','noah','kiefer'],2021:['victory','beggs','kiefer'],
2022:['kellyville','regent',''],2023:['noah','beggs','beggs'],2024:['morris','regent','regent'],2025:['stroud','victory','beggs']
}.items():
    for g,t in zip(grades,winners):
        add('championships',f'{year}-{g}',season=str(year),division=f'{year}-{g}',winnerTown=t,winnerName=towns[t]['name'] if t else '',verification='verified' if t else 'unknown',source=HOME)

fixtures=[
('08-22','beggs/inola henryetta/liberty chouteau/kellyville sperry/morris okmulgee/victory stroud/regent'),
('08-29','inola/stroud sperry/okmulgee morris/chouteau liberty/kellyville victory/henryetta regent/beggs'),
('09-12','stroud/sperry inola/okmulgee liberty/morris kellyville/victory henryetta/regent beggs/chouteau'),
('09-19','sperry/liberty victory/regent chouteau/inola kellyville/henryetta okmulgee/stroud morris/beggs'),
('09-26','victory/chouteau inola/sperry regent/liberty henryetta/morris kellyville/stroud okmulgee/beggs'),
('10-03','chouteau/sperry inola/regent liberty/victory stroud/henryetta morris/okmulgee beggs/kellyville'),
('10-10','chouteau/liberty regent/sperry victory/inola beggs/henryetta morris/stroud okmulgee/kellyville'),
('10-17','liberty/inola regent/chouteau sperry/victory henryetta/okmulgee stroud/beggs kellyville/morris')]
events={}
for week,(day,pairs) in enumerate(fixtures,1):
    for pair in pairs.split():
        a,h=pair.split('/')
        id=f'2026-w{week}-{h}-{a}'
        events[week,frozenset([a,h])]=add('events',id,name=f"{towns[a]['name']} at {towns[h]['name']}",season='2026',week=week,day='2026-'+day,awayTown=a,homeTown=h,venue=h,source=SCHEDULE)

tree=html.parse(sys.argv[1])
raw=Path(sys.argv[1]).read_text()
def left(id):
    return int(re.search(r'\[id="'+id+r'"\]\{position:relative;[^{}]+?left:([\d-]+)px',raw)[1])
def town_id(value):
    value=value.lower()
    return {'vcs':'victory','choutaeu':'chouteau','speery':'sperry','oklmulgee':'okmulgee'}.get(value,value)
def ensure_team(t,g):
    id=f'2026-{g}-{t}'
    if not any(team['id']==id for team in data.get('teams',[])):
        add('teams',id,name=towns[t]['name'],season='2026',division='2026-'+g,town=t,conference=confs[t],active=True,source=RULES)
    return id

week=0
columns={}
blocks=[]
for node in tree.xpath("//*[starts-with(@id,'comp-') and contains(@class,'rich-text')]"):
    txt=' '.join(x.strip() for x in node.itertext() if x.strip())
    if re.fullmatch(r'WEEK #\d+',txt):
        week=int(txt.split('#')[1])
    if txt=='PLAYOFFS': break
    grade=re.match(r'^([135])[/\-]([246]) GRADE',txt)
    if grade and grade.end()==len(txt): columns[week,left(node.get('id'))]=''.join(grade.groups())
    if re.search(r'\b[A-Z]+\s+\d+\s+[-@]?\s*[A-Z]+\s+\d+',txt,re.I):
        blocks.append((week,node.get('id'),''.join(grade.groups()) if grade else '',txt))
for week,id,grade,txt in blocks:
    g=grade or min((abs(x-left(id)),g) for (w,x),g in columns.items() if w==week)[1]
    for m in re.finditer(r'\b([a-z]+)\s+(\d+)\s*[-@]?\s+([a-z]+)\s+(\d+)(\s*["\'][^"\']+["\'])?',txt,re.I):
        t,x,u,y,note=m.groups()
        t,u=town_id(t),town_id(u)
        event=events.get((week,frozenset([t,u])))
        if not event: raise ValueError((week,g,t,u))
        h,a=event['homeTown'],event['awayTown']
        pts={t:int(x),u:int(y)}
        add('games',event['id']+'-'+g,season='2026',division='2026-'+g,week=week,day=event['day'],kickoff='',duration=90,venue=h,field='',home=ensure_team(h,g),away=ensure_team(a,g),event=event['id'],type='regular',status='forfeited' if note and 'f' in note.lower() else 'final',official=dict(home=pts[h],away=pts[a],overtime=bool(note and 'ot' in note.lower())),revision=0,source=SCORES)

playoffs=[
 ('12',[('victory','henryetta','victory','12:00'),('beggs','sperry','victory','13:30'),('okmulgee','inola','okmulgee','13:30'),('liberty','stroud','okmulgee','12:00')]),
 ('34',[('victory','kellyville','victory','15:00'),('stroud','regent','victory','16:30'),('beggs','inola','beggs','15:00'),('sperry','morris','beggs','16:30')]),
 ('56',[('victory','henryetta','victory','18:00'),('kellyville','inola','victory','19:30'),('stroud','sperry','stroud','19:30'),('regent','beggs','stroud','18:00')])]
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
def iso(day,time):
    return datetime.fromisoformat(day+'T'+time).replace(tzinfo=ZoneInfo('America/Chicago')).astimezone(timezone.utc).isoformat().replace('+00:00','Z')
for g,games in playoffs:
    bracket='2026-bracket-'+g
    add('brackets',bracket,name=names[g]+' playoffs',season='2026',division='2026-'+g,qualifiers=8,locked=True,source=PDF)
    for i,(h,a,v,time) in enumerate(games,1):
        add('games',bracket+'-q'+str(i),season='2026',division='2026-'+g,week=9,day='2026-10-24',kickoff=iso('2026-10-24',time),duration=90,venue=v,field='',home=ensure_team(h,g),away=ensure_team(a,g),bracket=bracket,round=1,type='playoff',status='scheduled',revision=0,source=HOME,notes='Published quarterfinal pairing. Result unavailable.',homeSeed=['N1','S2','S1','N2'][i-1],awaySeed=['S4','N3','N4','S3'][i-1])
    for i in [1,2]:
        add('games',bracket+'-s'+str(i),season='2026',division='2026-'+g,week=10,day='2026-10-31',kickoff='',duration=90,venue='',field='',home='',away='',homeFrom=bracket+'-q'+str(i*2-1),awayFrom=bracket+'-q'+str(i*2),bracket=bracket,round=2,type='playoff',status='scheduled',revision=0,source=PDF)
    add('games',bracket+'-f',season='2026',division='2026-'+g,week=11,day='2026-11-07',kickoff=iso('2026-11-07',{'12':'15:00','34':'17:00','56':'19:00'}[g]),duration=90,venue='inola',field='',home='',away='',homeFrom=bracket+'-s1',awayFrom=bracket+'-s2',bracket=bracket,round=3,type='championship',status='scheduled',revision=0,source=PDF,notes='Published championship date and venue. Matchup and result unavailable.')
for id,name,category,url in [('rules','2026 Football Rules','Rules',RULES),('cheer','CFL Cheer Competition','Cheer',HOME+'cfl-cheer'),('schedule','2026 Schedule PDF','Schedule',PDF),('roster-form','CFL Roster Form','Forms',HOME+'_files/ugd/0e61b4_3835fbf3a42545a785b173824e75cfe2.pdf'),('weigh-in','CFL Weigh-In Form','Forms',HOME+'_files/ugd/0e61b4_43727864d46a450a94234f263e6ae762.pdf')]:
    add('documents',id,name=name,category=category,url=url,source=HOME)
add('announcements','2026-postseason',name='2026 postseason schedule',body='The published schedule lists quarterfinals on October 24, semifinals on October 31, and Championship Saturday on November 7 in Inola.',day='2026-10-24',season='2026',url=PDF,source=PDF)
print(json.dumps(data,ensure_ascii=False,separators=(',',':')))
