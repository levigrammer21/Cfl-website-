import React,{useState} from 'react'
import {ArrowRight,CalendarDays,ChevronRight,ClipboardList,Flag,History,MapPin,Search,Shield,Star,Trophy,Users,Share2,Printer,CalendarCheck,Layers,FileText,Compass,LocateFixed} from 'lucide-react'
import {standings,BREAKERS,GAME_STATUS,hasScore,localDay,displayDate,displayTime,includesTeam,groupBy} from '../functions/domain.mjs'
import {Badge,Empty,Head,Section,Pill,ScoreCard,EventRow,External,Select,route,find,label,byDate,directions,formatStatus,currentSeason,download} from './ui.jsx'

const latest=xs=>[...xs].sort((a,b)=>byDate(b,a))
const sports=[[CalendarDays,'Games','Schedules & results','games'],[Trophy,'Standings','Division records','standings'],[Flag,'Playoffs','Brackets & seeds','playoffs'],[MapPin,'Field Maps','Venues & directions','fields']]
const recentGames=(db,season)=>latest(db.games.filter(g=>g.season===season && hasScore(g)))
const townGames=(db,games,town)=>games.filter(g=>[g.home,g.away].some(t=>find(db,'teams',t)?.town===town))
const prioritize=(db,games,town)=>town?[...townGames(db,games,town),...games.filter(g=>!townGames(db,[g],town).length)]:games
const groups=(list,key)=>[...groupBy(list,key)]
const sourceLink=row=><External href={row?.source}>League source</External>
const safeCount=n=>new Intl.NumberFormat('en-US').format(n)

export function Home({db,town}){
  const season=currentSeason(db)
  const today=localDay()
  const games=db.games.filter(g=>g.season===season?.id)
  const upcoming=prioritize(db,[...games].sort(byDate).filter(g=>g.day>=today && ['scheduled','in_progress'].includes(g.status) && g.home && g.away),town)
  const next=upcoming[0]?.day
  const recent=recentGames(db,season?.id)
  const balanced=groups(recent,g=>g.day).flatMap(([,day])=>{
    const buckets=groups(day,g=>g.division).sort(([a],[b])=>a.localeCompare(b)).map(([,games])=>games)
    return Array.from({length:Math.max(...buckets.map(x=>x.length))},(_,i)=>buckets.map(x=>x[i]).filter(Boolean)).flat()
  })
  const finals=prioritize(db,balanced,town)
  const featured=upcoming.length?upcoming.filter(g=>g.day===next):finals
  const activeTowns=db.towns.filter(t=>t.active!==false)
  const seasonDivisions=db.divisions.filter(d=>d.season===season?.id)
  const notices=latest(db.announcements.filter(a=>!a.season||a.season===season?.id))
  return <>
    <section className="hero">
      <div className="hero-content"><span className="hero-kicker"><span/>{season?season.year+' FOOTBALL SEASON':'OKLAHOMA YOUTH FOOTBALL'}</span><h1>CFL<br/><em>FOOTBALL.</em></h1><p>Oklahoma youth football, from the first kickoff to Championship Saturday.</p><div className="hero-actions"><a className="btn gold" href={route('games')}><CalendarDays size={18}/> Find a game <ArrowRight size={17}/></a><a className="btn glass" href={route('standings')}><Trophy size={18}/> Standings</a></div></div>
      <div className="hero-bottom"><span>FUN, FELLOWSHIP & FUNDAMENTALS</span><span>OKLAHOMA · YOUTH FOOTBALL</span></div>
    </section>
    <div className="quick-grid" aria-label="Quick links">{sports.map(([Icon,name,sub,page])=><a href={route(page)} className="quick-card" key={page}><span className="quick-icon"><Icon size={23}/></span><span><strong>{name}</strong><small>{sub}</small></span><ChevronRight className="quick-arrow" size={17}/></a>)}</div>
    <Section eyebrow="SCOREBOARD" title={upcoming.length?'Upcoming Games':'Latest Scores'} href={route('games',upcoming.length?{}:{view:'results'})} link={upcoming.length?'Full schedule':'All results'}>
      {featured.length?<div className="score-grid">{featured.slice(0,4).map(g=><ScoreCard key={g.id} g={g} db={db}/>)}</div>:<Empty title="Game information is coming">Schedules and confirmed results appear here when the league publishes them.</Empty>}
    </Section>
    <div className="home-lower">
      <section className="postseason-panel"><div className="postseason-symbol"><Trophy size={28}/></div><span className="eyebrow">{season?.year||''} POSTSEASON</span><h2>Road to the Championship</h2><p>See the matchups, follow each round and look back at the league’s champions.</p><a className="btn glass" href={route('playoffs')}>View playoff brackets <ArrowRight size={17}/></a></section>
      <section className="notices panel"><span className="eyebrow">AROUND THE LEAGUE</span><h2>League Updates</h2>{notices.length?notices.slice(0,2).map(a=><div className="notice" key={a.id}><small>{displayDate(a.day,{month:'short',day:'numeric',year:'numeric'})}</small><h3>{a.name}</h3><p>{a.body}</p><External href={a.url}>Details</External></div>):<p>League announcements will appear here.</p>}<a className="text-link" href={route('league')}>League information <ArrowRight size={15}/></a></section>
    </div>
    <div className="league-numbers"><div><strong>{safeCount(activeTowns.length)}</strong><span>Member programs</span></div><div><strong>{safeCount(seasonDivisions.length)}</strong><span>Grade divisions</span></div><div><strong>OK</strong><span>Oklahoma youth football</span></div></div>
  </>
}
function useSeason(db,params){return useState(params.get('season')||currentSeason(db)?.id||'')}
const seasons=db=>[...db.seasons].sort((a,b)=>b.year-a.year)
const divs=(db,s)=>db.divisions.filter(d=>d.season===s).sort((a,b)=>a.order-b.order)
function SeasonPicker({db,season,change}){return <Select label="Season" value={season} onChange={change} options={seasons(db)} hideEmpty/>}

export function Games({db,params,town}){
  const [season,setSeason]=useSeason(db,params),[week,setWeek]=useState(params.get('week')||''),[division,setDivision]=useState(params.get('division')||''),[selectedTown,setTown]=useState(params.get('town')||''),[team,setTeam]=useState(params.get('team')||''),[conference,setConference]=useState(''),[status,setStatus]=useState('')
  const [view,setView]=useState(params.get('view')||'schedule')
  const [page,setPage]=useState(1)
  const seasonGames=db.games.filter(g=>g.season===season)
  const seasonEvents=db.events.filter(e=>e.season===season)
  const teams=db.teams.filter(t=>t.season===season)
  const weeks=[...new Set([...seasonGames,...seasonEvents].map(g=>g.week))].sort((a,b)=>a-b).map(n=>({id:String(n),name:'Week '+n}))
  const match=g=>(!week||String(g.week)===week)&&(!division||g.division===division)&&(!selectedTown||townGames(db,[g],selectedTown).length)&&(!team||includesTeam(g,team))&&(!conference||[g.home,g.away].some(t=>find(db,'teams',t)?.conference===conference))&&(!status||g.status===status)
  const events=seasonEvents.filter(e=>(!week||String(e.week)===week)&&(!selectedTown||[e.homeTown,e.awayTown].includes(selectedTown))).sort(byDate)
  const all=seasonGames.filter(g=>match(g)&&(view!=='results'||hasScore(g)))
  const ordered=prioritize(db,view==='results'?latest(all):[...all].sort(byDate),town)
  const visible=ordered.slice(0,page*24)
  const update=fn=>value=>{setPage(1);fn(value)}
  const scheduleEvents=view==='schedule' && events.length>0 && !division && !team && !conference && !status
  const printedGames=scheduleEvents?ordered.filter(g=>!g.event):ordered
  return <>
    <Head eyebrow="GAME CENTER" title="Games" description="Find a kickoff, look up a result or get directions to the field." action={<button className="btn outline no-print" onClick={()=>window.print()}><Printer size={17}/> Print schedule</button>}/>
    <div className="segmented no-print" aria-label="Game view">{[['schedule','Schedule'],['results','Results']].map(([id,name])=><button key={id} aria-pressed={view===id} onClick={()=>update(setView)(id)}>{name}</button>)}</div>
    <div className="filters no-print">
      <SeasonPicker db={db} season={season} change={v=>{setSeason(v);setWeek('');setDivision('');setTeam('');setConference('');setPage(1)}}/>
      <Select label="Week" value={week} onChange={update(setWeek)} options={weeks}/>
      <Select label="Grade division" value={division} onChange={update(setDivision)} options={divs(db,season)}/>
      <Select label="Town" value={selectedTown} onChange={update(setTown)} options={db.towns}/>
      <Select label="Team" value={team} onChange={update(setTeam)} options={teams.map(t=>({...t,name:t.name+' · '+label(db,'divisions',t.division,'')}))}/>
      <Select label="Conference" value={conference} onChange={update(setConference)} options={find(db,'seasons',season)?.conferences||[]}/>
      <Select label="Status" value={status} onChange={update(setStatus)} options={Object.entries(GAME_STATUS).map(([id,name])=>({id,name}))}/>
    </div>
    {scheduleEvents&&groups(events,e=>e.week).map(([week,list])=><Section key={week} title={'Week '+week} eyebrow={displayDate(list[0].day)}><div className="event-list">{list.map(event=><EventRow key={event.id} db={db} event={event}/>)}</div></Section>)}
    {!scheduleEvents&&!visible.length&&<Empty title="No matching games">Try a different week, season or team.</Empty>}
    {(scheduleEvents?printedGames.length:visible.length)>0&&<Section title={scheduleEvents?'Postseason & standalone games':view==='results'?'Official results':'Game schedule'}><div className="score-grid">{(scheduleEvents?printedGames:visible).map(g=><ScoreCard key={g.id} g={g} db={db}/>)}</div>{!scheduleEvents&&ordered.length>visible.length&&<button className="btn outline load-more no-print" onClick={()=>setPage(page+1)}>Load more games</button>}</Section>}
    {!scheduleEvents&&ordered.length>visible.length&&<div className="print-only score-grid">{ordered.slice(visible.length).map(g=><ScoreCard key={g.id} g={g} db={db}/>)}</div>}
  </>
}

export function Game({db,id}){
  const g=find(db,'games',id), [shared,setShared]=useState('')
  if(!g)return <Empty title="Game unavailable">This game may have been moved or is awaiting publication.</Empty>
  const venue=find(db,'venues',g.venue)
  const copy=async()=>{try{await navigator.clipboard.writeText(location.href);setShared('Link copied')}catch{setShared('Copy the address from your browser to share.')} }
  return <><a className="back-link" href={route('games',{season:g.season})}>← Back to games</a><Head eyebrow={label(db,'divisions',g.division,'FOOTBALL').toUpperCase()} title={(g.type==='championship'?'Championship':g.type==='playoff'?'Playoff matchup':'Game details')} description={displayDate(g.day,{weekday:'long',month:'long',day:'numeric',year:'numeric'})} action={<button className="btn outline" onClick={copy}><Share2 size={17}/>{shared||'Copy game link'}</button>}/>
  <div className="game-detail panel"><Pill tone={hasScore(g)?'green':''}>{formatStatus(g)}{g.official?.overtime?' · OT':''}</Pill><div className="versus">{['away','home'].map(side=>{const team=find(db,'teams',g[side]);return <div key={side}><Badge db={db} team={team}/><small>{side}</small><h2>{team?<a href={route('team',{id:team.id})}>{team.name}</a>:g[side+'Seed']||'To be determined'}</h2>{hasScore(g)&&<strong>{g.official[side]}</strong>}</div>})}</div></div>
  <div className="detail-grid"><article className="panel pad"><CalendarDays/><h2>Kickoff</h2><p>{displayTime(g.kickoff)}</p><p>{g.notes}</p>{sourceLink(g)}</article><article className="panel pad"><MapPin/><h2>{venue?.name||'Field to be announced'}</h2><p>{venue?.address}</p>{g.field&&<p>Field {g.field}</p>}{venue&&<External href={directions(venue)}>Get directions</External>}</article></div></>
}

export function Standings({db,params}){
  const [season,setSeason]=useSeason(db,params), [division,setDivision]=useState(params.get('division')||divs(db,season)[0]?.id||''), [conference,setConference]=useState('')
  const rules=find(db,'seasons',season)
  const divisions=divs(db,season)
  const d=divisions.find(x=>x.id===division)
  const teamList=db.teams.filter(t=>t.season===season && (!division||t.division===division) && t.active!==false)
  const gs=db.games.filter(g=>g.season===season && (!division||g.division===division))
  const confs=rules?.conferences||[]
  const options={...rules,allTeams:teamList,breakers:d?.breakers?.length?d.breakers:rules?.breakers}
  const split=confs.length>0 && !conference && options.breakers?.includes('conference')
  const sections=split?[...confs.map(c=>[c,teamList.filter(t=>t.conference===c)]),['Unassigned',teamList.filter(t=>!t.conference)]]:[[conference||'League',conference?teamList.filter(t=>t.conference===conference):teamList]]
  return <><Head eyebrow="LEAGUE RECORDS" title="Standings" description="Records are calculated from published regular-season results."/>
  <div className="filters compact"><SeasonPicker db={db} season={season} change={v=>{setSeason(v);setDivision(divs(db,v)[0]?.id||'');setConference('')}}/><Select label="Grade division" value={division} onChange={setDivision} options={divisions} hideEmpty/><Select label="Conference" value={conference} onChange={setConference} options={confs} empty="All conferences"/></div>
  {teamList.length===0&&<Empty title="Standings unavailable">Published teams and results will appear here.</Empty>}
  {sections.filter(([,teams])=>teams.length).map(([name,teams])=><Section key={name} title={name+(name==='League'?' standings':' Conference')}><div className="table-wrap"><table><thead><tr>{['Rank','Team','W','L','T','Win %','PF','PA',...(confs.length?['Conf.','Conf. pts']:[])].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{standings(teams,gs,options).map(r=><tr key={r.team.id}><td>{r.rank??'—'}{r.rank&&r.tied?'=':''}</td><td><a className="table-team" href={route('team',{id:r.team.id})}><Badge db={db} team={r.team} small/>{r.team.name}</a></td><td>{r.w}</td><td>{r.l}</td><td>{r.t}</td><td>{(r.pct*100).toFixed(1)}%</td><td>{r.pf}</td><td>{r.pa}</td>{confs.length>0&&<><td>{r.cw}–{r.cl}–{r.ct}</td><td>{r.cp}</td></>}</tr>)}</tbody></table></div></Section>)}
  {rules&&<article className="panel pad rules-card"><h2>How standings are ranked</h2><p>{options.breakers?.length?options.breakers.map(k=>BREAKERS[k]).join(' → '):'The league has not published a tiebreaker sequence for this division.'}</p>{(d?.notes||rules.notes)&&<p>{d?.notes||rules.notes}</p>}<External href={rules.rulesUrl}>League rules</External></article>}</>
}

export function Playoffs({db,params}){
  const [season,setSeason]=useSeason(db,params),[division,setDivision]=useState(params.get('division')||divs(db,season)[0]?.id||'')
  const brackets=db.brackets.filter(b=>b.season===season&&b.division===division)
  return <><Head eyebrow="POSTSEASON" title="Playoffs" description="Follow the bracket from the opening round through Championship Saturday."/>
    <div className="filters compact"><SeasonPicker db={db} season={season} change={v=>{setSeason(v);setDivision(divs(db,v)[0]?.id||'')}}/><Select label="Grade division" value={division} onChange={setDivision} options={divs(db,season)} hideEmpty/></div>
    {!brackets.length&&<Empty title="Bracket unavailable" icon={Trophy}>A bracket appears here once the league publishes it.</Empty>}
    {brackets.map(b=>{
      const rounds=groups(db.games.filter(g=>g.bracket===b.id).sort((a,b)=>a.round-b.round||a.id.localeCompare(b.id)),g=>g.round)
      const winner=db.championships.find(c=>c.season===season&&c.division===division&&c.verification==='verified')
      return <Section key={b.id} title={b.name}><div className="bracket-note"><Pill>{b.qualifiers} qualifiers</Pill><p>{winner?'Champion: '+winner.winnerName:'Champion: awaiting a published result'}</p>{sourceLink(b)}</div>{b.notes&&<p>{b.notes}</p>}<div className="bracket">{rounds.map(([round,games],i)=><div key={round} className="round"><h3>{games.some(g=>g.type==='championship')?'Championship':games.length===4?'Quarterfinals':games.length===2&&rounds[i+1]?.[1].length===1?'Semifinals':'Round '+round}</h3>{games.map(g=><ScoreCard g={g} db={db} key={g.id}/>)}</div>)}</div></Section>
    })}
  </>
}

export function Teams({db,params,town,setTown}){
  const [season,setSeason]=useSeason(db,params),[conference,setConference]=useState('')
  const teams=db.teams.filter(t=>t.season===season && (!conference||t.conference===conference))
  const program=[...db.towns].filter(t=>teams.some(team=>team.town===t.id)).sort((a,b)=>Number(b.id===town)-Number(a.id===town)||a.name.localeCompare(b.name))
  return <><Head eyebrow="MEMBER PROGRAMS" title="Teams & Towns" description="Find your program, grade division and home field."/><div className="filters compact"><SeasonPicker db={db} season={season} change={v=>{setSeason(v);setConference('')}}/><Select label="Conference" value={conference} onChange={setConference} options={find(db,'seasons',season)?.conferences||[]}/></div>
  {!program.length&&<Empty title="No teams published for this season" icon={Users}/>}<div className="catalog-grid">{program.map(t=><article key={t.id} className="panel pad program-card"><a className="program-link" href={route('town',{id:t.id,season})}><Badge db={db} town={t}/><div><h2>{t.name}</h2><p>{t.mascot||'CFL member program'}</p></div><ChevronRight size={18}/></a><div className="program-foot"><span>{teams.filter(team=>team.town===t.id).length} teams</span><button className="plain-star" aria-pressed={town===t.id} onClick={()=>setTown(town===t.id?'':t.id)}><Star size={16} fill={town===t.id?'currentColor':'none'}/>{town===t.id?'My Town':'Set My Town'}</button></div></article>)}</div></>
}

export function Program({db,kind,id,params,town,setTown}){
  const [season,setSeason]=useSeason(db,params)
  const team=kind==='team'?find(db,'teams',id):null
  const program=find(db,'towns',team?.town||id)
  if(!program)return <Empty title="Program unavailable" icon={Users}/>
  const teams=team?[team]:db.teams.filter(t=>t.season===season&&t.town===program.id)
  const venues=db.venues.filter(v=>v.town===program.id)
  const games=db.games.filter(g=>teams.some(t=>includesTeam(g,t.id))).sort(byDate)
  const rule=find(db,'seasons',team?.season||season)
  const record=team?standings([team,...db.teams.filter(t=>t.division===team.division&&t.id!==team.id)],db.games,{...rule}).find(r=>r.team.id===team.id):null
  return <><a className="back-link" href={route('teams')}>← Teams & towns</a><Head eyebrow={team?label(db,'divisions',team.division):'MEMBER PROGRAM'} title={team?.name||program.name} description={program.mascot||team?.conference||''} action={<button className="btn outline" onClick={()=>setTown(town===program.id?'':program.id)} aria-pressed={town===program.id}><Star size={18} fill={town===program.id?'currentColor':'none'}/>{town===program.id?'My Town':'Set My Town'}</button>}/>
    {!team&&<div className="filters compact"><SeasonPicker db={db} season={season} change={setSeason}/></div>}
    {team&&<div className="panel pad"><p><strong>{record.w}–{record.l}–{record.t}</strong> regular-season record {team.conference?'· '+team.conference+' Conference':''}</p>{team.coach&&<p>Coach {team.coach}</p>}</div>}
    {!team&&<Section title="Grade teams"><div className="catalog-grid">{teams.map(t=><a key={t.id} className="panel pad resource" href={route('team',{id:t.id})}><Users size={20}/><div><h3>{t.name}</h3><p>{label(db,'divisions',t.division)}</p></div><ChevronRight size={18}/></a>)}</div>{!teams.length&&<Empty title="No teams for this season"/>}</Section>}
    {venues.length>0&&<Section title="Home fields"><div className="catalog-grid">{venues.map(v=><a key={v.id} className="panel pad resource" href={route('field',{id:v.id})}><MapPin size={20}/><div><h3>{v.name}</h3><p>{v.address}</p></div><ChevronRight size={18}/></a>)}</div></Section>}
    {program.contact&&<p>{program.contact} <External href={program.contactUrl}>Contact information</External></p>}
    <Section title="Schedule & results" href={route('games',team?{team:team.id,season:team.season}:{town:program.id,season})} link="All games">{games.length?<div className="score-grid">{games.slice(0,12).map(g=><ScoreCard g={g} db={db} key={g.id}/>)}</div>:<Empty title="No games published"/>}</Section>
  </>
}

export function Fields({db,id}){
  const venue=id?find(db,'venues',id):null
  if(id&&!venue)return <Empty title="Field unavailable" icon={MapPin}/>
  return <>{venue&&<a className="back-link" href={route('fields')}>← All fields</a>}<Head eyebrow="GAME DAY TRAVEL" title={venue?.name||'Field Maps'} description={venue?.address||'Look up field addresses and open turn-by-turn directions.'} action={venue&&<External href={directions(venue)} className="btn primary"><Compass size={17}/> Directions</External>}/>
    {venue?<><div className="panel pad"><h2>Field information</h2><p>{venue.field||'Field assignments appear on individual game pages.'}</p>{venue.entrance&&<p><b>Entrance</b> {venue.entrance}</p>}{venue.parking&&<p><b>Parking</b> {venue.parking}</p>}{sourceLink(venue)}</div><Section title="Games at this venue" href={route('games')} link="Full schedule"><div className="score-grid">{latest(db.games.filter(g=>g.venue===venue.id)).slice(0,12).map(g=><ScoreCard key={g.id} db={db} g={g}/>)}</div></Section></>:<div className="catalog-grid">{db.venues.map(v=><article className="panel pad field-card" key={v.id}><span className="quick-icon"><MapPin size={22}/></span><h2><a href={route('field',{id:v.id})}>{v.name}</a></h2><p>{v.address}</p><div><a className="text-link" href={route('field',{id:v.id})}>Field details <ChevronRight size={16}/></a><External href={directions(v)}>Directions</External></div></article>)}</div>}
  </>
}
export function Archive({db,params}){
  const [season,setSeason]=useState(params.get('season')||'')
  const chosen=season?seasons(db).filter(s=>s.id===season):seasons(db)
  const wins=Object.entries(db.championships.filter(c=>c.verification==='verified'&&c.winnerTown).reduce((a,c)=>(a[c.winnerTown]=(a[c.winnerTown]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]||label(db,'towns',a[0]).localeCompare(label(db,'towns',b[0])))
  return <><Head eyebrow="THE CFL RECORD BOOK" title="League History" description="Champions by year and grade, based on published league records."/><div className="filters compact"><Select label="Season" value={season} onChange={setSeason} options={seasons(db)} empty="All seasons"/></div>
    <div className="archive-layout"><div>{chosen.map(s=><article className="panel pad archive-year" key={s.id}><div className="archive-title"><h2>{s.year}</h2><div><a className="text-link" href={route('standings',{season:s.id})}>Standings</a><a className="text-link" href={route('playoffs',{season:s.id})}>Brackets</a></div></div>{divs(db,s.id).map(d=>{const c=db.championships.find(c=>c.season===s.id&&c.division===d.id&&c.verification==='verified');const game=find(db,'games',c?.game);return <div className="champ-row" key={d.id}><span>{d.name}</span><strong>{c?.winnerName||'Unknown'}</strong>{c?.runnerUp&&<small>Runner-up {c.runnerUp}</small>}{game&&hasScore(game)&&<a className="text-link" href={route('game',{id:game.id})}>{game.official.away}–{game.official.home}</a>}{c&&sourceLink(c)}</div>})}</article>)}</div><aside className="panel pad leader"><Trophy size={24}/><h2>Championship totals</h2><p>Verified titles in this archive</p>{wins.map(([id,n])=><div key={id}><Badge db={db} town={find(db,'towns',id)} small/><span>{label(db,'towns',id)}</span><b>{n}</b></div>)}</aside></div>
  </>
}
export function League({db,fileBlob}){
  const [status,setStatus]=useState('')
  const get=async d=>{try{setStatus('Downloading…');download(d.name.replace(/[^a-z0-9- ]/gi,'')+'.'+d.storagePath.split('.').at(-1),await fileBlob(d.id));setStatus('Download started.')}catch{setStatus('This document could not be downloaded. Please try again.')}}
  return <><Head eyebrow="CFL RESOURCES" title="League Info" description="Announcements, forms, football rules and cheer information."/><Section title="Announcements">{db.announcements.length?latest(db.announcements).map(a=><article className="panel pad resource-block" key={a.id}><small>{displayDate(a.day)}</small><h3>{a.name}</h3><p>{a.body}</p><External href={a.url}>More information</External></article>):<Empty title="No announcements yet" icon={ClipboardList}/>}</Section><Section title="Rules, forms & cheer"><p role="status">{status}</p><div className="catalog-grid">{db.documents.map(d=><article key={d.id} className="panel pad resource"><FileText size={22}/><div><h3>{d.name}</h3><p>{d.category}</p>{d.notes&&<p>{d.notes}</p>}{d.storagePath?<button className="text-link" onClick={()=>get(d)}>Download</button>:<External href={d.url}>Open resource</External>}</div></article>)}</div></Section>
  <Section title="Program contacts"><div className="catalog-grid">{db.towns.filter(t=>t.contact).map(t=><article className="panel pad" key={t.id}><h3>{t.name}</h3><p>{t.contact}</p><External href={t.contactUrl}>Contact details</External></article>)}</div>{!db.towns.some(t=>t.contact)&&<div className="panel pad"><p>See the league’s current member contacts on the existing CFL directory.</p><External href="https://www.cfl1.org/members">Member directory</External></div>}</Section></>
}
export function SearchPage({db,params}){
  const [term,setTerm]=useState(params.get('q')||'')
  const entries=[
    ...db.towns.map(x=>['Town',x.name,route('town',{id:x.id}),x.mascot]),
    ...db.teams.map(x=>['Team',x.name+' · '+label(db,'divisions',x.division),route('team',{id:x.id}),x.conference]),
    ...db.venues.map(x=>['Field',x.name,route('field',{id:x.id}),x.address]),
    ...db.seasons.map(x=>['Season',x.name,route('history',{season:x.id}),'Archive']),
    ...db.games.map(x=>['Game',label(db,'teams',x.away,'TBD')+' at '+label(db,'teams',x.home,'TBD'),route('game',{id:x.id}),[x.day,label(db,'divisions',x.division),formatStatus(x)].filter(Boolean).join(' · ')])
  ]
  const words=term.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits=words.length?entries.filter(row=>words.every(w=>[row[0],row[1],row[3]].join(' ').toLowerCase().includes(w))):[]
  const [limit,setLimit]=useState(36)
  return <><Head eyebrow="FIND WHAT YOU NEED" title="Search CFL"/><form className="search-form" onSubmit={e=>{e.preventDefault();location.hash=route('search',{q:term.trim()})}}><label className="sr-only" htmlFor="search">Search the league</label><Search size={21}/><input id="search" value={term} onChange={e=>{setTerm(e.target.value);setLimit(36)}} placeholder="Try Stroud, Grades 3–4, or a field name"/><button className="btn primary">Search</button></form>{words.length?hits.length?<Section title={hits.length+' results'}><div className="catalog-grid">{hits.slice(0,limit).map(([type,name,path,meta])=><a key={path} href={path} className="panel pad resource"><div><span className="eyebrow">{type}</span><h3>{name}</h3><p>{meta}</p></div><ChevronRight size={16}/></a>)}</div>{hits.length>limit&&<button className="btn outline load-more" onClick={()=>setLimit(limit+36)}>Show more results</button>}</Section>:<Empty title="No matches" icon={Search}>Try a shorter name or a different spelling.</Empty>:<Empty title="Search teams, games, fields and seasons" icon={Search}/>}</>
}
