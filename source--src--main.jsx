import React,{useEffect,useState,lazy,Suspense} from 'react'
import {createRoot} from 'react-dom/client'
import {ArrowRight,ChevronDown,Menu,Search,Shield,Star,X,CalendarDays,Trophy,Users,MapPin,History,Flag,ClipboardList,AlertCircle,CloudOff} from 'lucide-react'
import legacy from '../fixtures/legacy.json'
import {KINDS} from '../functions/domain.mjs'
import {Home,Games,Game,Standings,Playoffs,Teams,Program,Fields,Archive,League,SearchPage} from './public.jsx'
import {Mark,Empty,Head,route,find,currentSeason} from './ui.jsx'
import './style.css'

const preview=(import.meta.env.VITE_CFL_MODE||'preview')==='preview'
const Office=preview?null:lazy(()=>import('./office.jsx'))
const loadPublished=()=>import('./cloud.js').then(module=>module.loadPublished())
const fileBlob=preview?undefined:id=>import('./cloud.js').then(module=>module.fileBlob(id))
const officePreview=<><Head eyebrow="CFL STAFF" title="League Office" description="The workspace for league administrators, town directors and coaches."/><Empty title="Staff access opens after Firebase setup" icon={CloudOff}>This review build uses published league records. Staff accounts and private data require the deployed league service.</Empty></>
const nav=[['games','Games',CalendarDays],['standings','Standings',Trophy],['teams','Teams',Users],['playoffs','Playoffs',Flag],['fields','Fields',MapPin],['history','History',History],['league','League Info',ClipboardList]]
const blank=Object.fromEntries(KINDS.map(k=>[k,[]]))
const getHash=()=>location.hash.slice(2)||'home'
const getTown=()=>{try{return localStorage.getItem('cfl.myTown')||''}catch{return ''}}

function App(){
  const [hash,setHash]=useState(getHash),[town,setTownState]=useState(getTown),[menu,setMenu]=useState(false),[townMenu,setTownMenu]=useState(false)
  const [records,setRecords]=useState(preview?legacy:null),[error,setError]=useState('')
  const refresh=()=>{if(preview)return Promise.resolve();setError('');return loadPublished().then(setRecords).catch(()=>setError('League data is temporarily unavailable.'))}
  const setTown=value=>{setTownState(value);setTownMenu(false);try{localStorage.setItem('cfl.myTown',value)}catch{}}
  useEffect(()=>{refresh();const cb=()=>{setHash(getHash());setMenu(false);setTownMenu(false);window.scrollTo(0,0)};window.addEventListener('hashchange',cb);return ()=>window.removeEventListener('hashchange',cb)},[])
  const [page,query]=hash.split('?')
  const params=new URLSearchParams(query)
  const id=params.get('id')
  const db={...blank,...records}
  const chosen=find(db,'towns',town)
  const season=currentSeason(db)
  const title={home:'Oklahoma Youth Football',game:'Game Details',town:'Town Profile',team:'Team Profile',field:'Field Details',search:'Search',office:'League Office'}[page]||nav.find(x=>x[0]===page)?.[1]||'Page unavailable'
  useEffect(()=>{document.title='CFL Football | '+title},[title])
  const active=page==='game'?'games':['town','team'].includes(page)?'teams':page==='field'?'fields':page
  const pages={home:Home,games:Games,game:Game,standings:Standings,playoffs:Playoffs,teams:Teams,town:Program,team:Program,fields:Fields,field:Fields,history:Archive,league:League,search:SearchPage}
  const Current=pages[page]
  return <>
    <a className="skip" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus()}}>Skip to content</a>
    <div className="utility no-print"><div className="shell utility-inner"><span><span className="utility-dot"/> OKLAHOMA YOUTH FOOTBALL</span><div><a href={route('office')}><Shield size={14}/> League Office</a></div></div></div>
    <header className="site-header no-print"><div className="shell header-inner">
      <a className="brand" href={route()} aria-label="CFL Football home"><Mark/><span><strong>CFL FOOTBALL</strong><small>YOUTH FOOTBALL LEAGUE</small></span></a>
      <nav className="desktop-nav" aria-label="Main navigation">{nav.map(([id,label])=><a key={id} href={route(id)} aria-current={active===id?'page':undefined}>{label}</a>)}</nav>
      <div className="header-actions"><a className="icon-btn" href={route('search')} aria-label="Search the league"><Search size={20}/></a><div className="town-widget"><button className="btn town-btn" aria-expanded={townMenu} onClick={()=>{setTownMenu(!townMenu);setMenu(false)}}><Star size={16} fill={chosen?'currentColor':'none'}/><span>{chosen?.name||'My Town'}</span><ChevronDown size={14}/></button>{townMenu&&<div className="town-menu"><b>My Town</b><p>Put your town’s games first on this device.</p><label className="sr-only" htmlFor="favorite">Choose your town</label><select id="favorite" value={town} onChange={e=>setTown(e.target.value)}><option value="">No preference</option>{db.towns.filter(t=>t.active!==false).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>{chosen&&<a className="text-link" onClick={()=>setTownMenu(false)} href={route('town',{id:chosen.id})}>Open town page <ArrowRight size={14}/></a>}</div>}</div><button className="icon-btn mobile-menu" aria-expanded={menu} aria-label={menu?'Close navigation':'Open navigation'} onClick={()=>{setMenu(!menu);setTownMenu(false)}}>{menu?<X/>:<Menu/>}</button></div>
    </div>{menu&&<nav className="mobile-nav shell" aria-label="Mobile navigation">{nav.map(([id,label,Icon])=><a key={id} href={route(id)} onClick={()=>setMenu(false)} aria-current={active===id?'page':undefined}><Icon size={18}/>{label}<ArrowRight size={15}/></a>)}</nav>}</header>
    <main className="shell main" id="main-content" tabIndex={-1}>{page==='office'?preview?officePreview:<Suspense fallback={<div className="loading" role="status">Opening League Office…</div>}><Office refreshPublic={refresh}/></Suspense>:error?<div className="panel pad error"><AlertCircle/><p>{error}</p><button className="btn primary" onClick={refresh}>Try again</button></div>:!records?<div className="loading" role="status">Loading league information…</div>:Current?<Current key={hash} db={db} town={town} setTown={setTown} params={params} id={id} kind={page} fileBlob={fileBlob}/>:<Empty title="Page unavailable"><a className="text-link" href={route()}>Go to CFL Football</a></Empty>}</main>
    <footer className="footer no-print"><div className="shell"><div className="footer-grid"><div><a href={route()} className="brand"><Mark/><span><strong>CFL FOOTBALL</strong><small>OKLAHOMA YOUTH FOOTBALL</small></span></a><p>Fun, fellowship and fundamentals.</p></div><div><b>Game Center</b><a href={route('games')}>Games</a><a href={route('standings')}>Standings</a><a href={route('playoffs')}>Playoffs</a></div><div><b>The League</b><a href={route('teams')}>Teams & towns</a><a href={route('fields')}>Field maps</a><a href={route('history')}>League history</a></div><div><b>Resources</b><a href={route('league')}>Rules & forms</a><a href={route('office')}>League Office</a><a href={route('search')}>Search</a></div></div><div className="footer-bottom"><span>© {season?.year||new Date().getFullYear()} CFL Football</span><span>{preview?'REVIEW BUILD · PUBLISHED SOURCE DATA':'OKLAHOMA YOUTH FOOTBALL'}</span></div></div></footer>
  </>
}

createRoot(document.getElementById('root')).render(<App/>)
