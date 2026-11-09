import React from 'react'
import {ArrowRight,CalendarDays,ChevronRight,MapPin,ExternalLink} from 'lucide-react'
import {displayDate,displayTime,GAME_STATUS,hasScore} from '../functions/domain.mjs'

export const route=(path='home',params={})=>'#/'+path+(Object.keys(params).length?'?'+new URLSearchParams(params):'')
export const find=(db,kind,id)=>db[kind]?.find(r=>r.id===id)
export const byDate=(a,b)=>(a.day??'').localeCompare(b.day??'')||(a.kickoff??'').localeCompare(b.kickoff??'')
export const titleCase=s=>s?.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase())
export const label=(db,kind,id,fallback='To be announced')=>find(db,kind,id)?.name||fallback
export const formatStatus=g=>g.bye?'Bye':GAME_STATUS[g.status]||titleCase(g.status)
export const directions=v=>v?.directions || (v?.address?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(v.address):'')
export const currentSeason=db=>db.seasons.find(s=>s.status==='active')||[...db.seasons].sort((a,b)=>b.year-a.year)[0]
export const logoUrl=import.meta.env.BASE_URL+'mark.svg'
export const Mark=()=> <img className="brand-mark" src={logoUrl} alt="" width="42" height="47"/>
export function Badge({db,team,town,small=false}){
  const t=town??find(db,'towns',team?.town)
  const name=t?.name||team?.name||'?'
  const initials=name==='Victory Christian'?'VC':name.split(' ').length>1?name.split(' ').slice(0,2).map(s=>s[0]).join(''):name.slice(0,2).toUpperCase()
  return <span aria-hidden="true" className={'team-badge'+(small?' tiny':'')} style={{'--team':t?.color||'#375473'}}>{t?.logo?<img alt="" src={t.logo} loading="lazy"/>:initials}</span>
}
export const Empty=({title='Nothing to show yet',children,icon:Icon=CalendarDays})=><div className="empty"><span className="empty-icon"><Icon size={22}/></span><h3>{title}</h3>{children&&<p>{children}</p>}</div>
export function Head({eyebrow,title,description,action}){return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>}
export function Section({eyebrow,title,href,link,children}){
  return <section className="section"><div className="section-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{href&&<a className="text-link" href={href}>{link}<ArrowRight size={16}/></a>}</div>{children}</section>
}
export const Pill=({children,tone=''})=><span className={'pill '+tone}>{children}</span>
export function ScoreCard({g,db}){
  const score=hasScore(g)
  const date=displayDate(g.day)
  return <a className="score-card" href={route('game',{id:g.id})}>
    <div className="score-meta"><span>{label(db,'divisions',g.division,'Football')}</span><Pill tone={score?'green':''}>{formatStatus(g)}{g.official?.overtime?' · OT':''}</Pill></div>
    <div className="score-teams">{['away','home'].map(side=>{
      const team=find(db,'teams',g[side])
      const win=score&&g.official[side]>g.official[side==='home'?'away':'home']
      return <div key={side} className={'score-team '+(win?'winner':'')}><Badge db={db} team={team} small/><span>{team?.name||g[side+'Seed']||(g.bye&&!g[side+'From']?'Bye':'To be determined')}</span>{score&&<strong>{g.official[side]}</strong>}</div>
    })}</div>
    <div className="score-foot"><CalendarDays size={14}/>{date}{g.kickoff&&!score&&' · '+displayTime(g.kickoff)}<ChevronRight size={15}/></div>
  </a>
}
export function EventRow({event,db}){
  const games=db.games.filter(g=>g.event===event.id)
  return <article className="event-row"><div><h3>{event.name}</h3><p><CalendarDays size={15}/> {displayDate(event.day)} · Week {event.week}</p>{event.venue&&<a className="text-link" href={route('field',{id:event.venue})}><MapPin size={15}/>{label(db,'venues',event.venue)}</a>}</div><div className="event-results">{games.map(g=><a key={g.id} href={route('game',{id:g.id})}>{label(db,'divisions',g.division)} <b>{hasScore(g)?g.official.away+'–'+g.official.home:displayTime(g.kickoff)}</b><ChevronRight size={15}/></a>)}{!games.length&&<span>Grade matchups to be announced</span>}</div></article>
}
export const External=({href,children,className='text-link'})=>href?<a className={className} href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={15}/></a>:null
export function Select({label,value,onChange,options,empty='All',hideEmpty=false}){
  return <label className="select-label">{label}<select value={value} onChange={e=>onChange(e.target.value)}>{!hideEmpty&&<option value="">{empty}</option>}{options.map(x=><option key={x.id??x} value={x.id??x}>{x.name??x}</option>)}</select></label>
}
export function download(name,blob){
  const href=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=href;link.download=name;link.click()
  setTimeout(()=>URL.revokeObjectURL(href),10000)
}
