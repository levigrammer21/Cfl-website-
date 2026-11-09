import React,{useEffect,useState} from 'react'
import {GoogleAuthProvider,createUserWithEmailAndPassword,onAuthStateChanged,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signInWithPopup,signOut} from 'firebase/auth'
import {ArrowRight,CalendarDays,ClipboardList,FileDown,Flag,History,Plus,Search,Shield,Users,X} from 'lucide-react'
import {KINDS,LABELS,BREAKERS,GAME_STATUS,ZONE,canSeeRoster,hasScore,isAdmin,sides,localDateTime,displayDate,localDay} from '../functions/domain.mjs'
import {normalize} from '../functions/schema.mjs'
import {auth,call} from './staff.js'
import {Badge,Empty,Head,Select,Pill,route,find,label,byDate,download,formatStatus} from './ui.jsx'

const kinds={seasons:'Seasons',towns:'Towns',divisions:'Divisions',teams:'Teams',venues:'Venues',events:'Town events',games:'Games',brackets:'Brackets',championships:'Champions',announcements:'Announcements',documents:'Documents'}
const unique=()=>globalThis.crypto.randomUUID()
const api=(action,data={})=>call(action,{...data,operation:unique()})
const errorText=e=>e?.message?.replace(/^Firebase: /,'')||'Something went wrong. Please try again.'
const displayAt=x=>x?new Intl.DateTimeFormat('en-US',{timeZone:ZONE,dateStyle:'medium',timeStyle:'short'}).format(new Date(x)):''
const score=x=>x?x.away+' away – '+x.home+' home':'—'
const matchup=(db,g)=>g?label(db,'teams',g.away,g.awaySeed||'TBD')+' at '+label(db,'teams',g.home,g.homeSeed||'TBD'):'Game unavailable'
const rowTitle=(db,kind,row)=>row.name||(kind==='games'?matchup(db,row):kind==='championships'?row.winnerName||label(db,'divisions',row.division):row.id)

function Account(){
  const [flow,setFlow]=useState('sign in'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const work=async fn=>{setBusy(true);setNotice('');try{await fn()}catch(e){setNotice(errorText(e))}finally{setBusy(false)}}
  const submit=e=>{
    e.preventDefault()
    const f=new FormData(e.currentTarget),email=f.get('email'),password=f.get('password')
    work(async ()=>{
      if(flow==='reset'){await sendPasswordResetEmail(auth,email);setNotice('If that address has an account, check its inbox for a reset link.');return}
      if(flow==='create'){
        const result=await createUserWithEmailAndPassword(auth,email,password)
        await sendEmailVerification(result.user);return
      }
      await signInWithEmailAndPassword(auth,email,password)
    })
  }
  return <div className="office-entry panel pad"><span className="quick-icon"><Shield size={24}/></span><h2>Staff sign-in</h2><p>Use the email address your league administrator assigned.</p>
    <button className="btn outline" disabled={busy} onClick={()=>work(()=>signInWithPopup(auth,new GoogleAuthProvider()))}>Continue with Google <ArrowRight size={16}/></button>
    <form className="office-form" onSubmit={submit}><label className="field-label">Email<input name="email" type="email" autoComplete="email" required/></label>{flow!=='reset'&&<label className="field-label">Password<input name="password" type="password" minLength={6} autoComplete={flow==='create'?'new-password':'current-password'} required/></label>}<button className="btn primary" disabled={busy}>{flow==='reset'?'Send reset link':flow==='create'?'Create account':'Sign in with email'}</button></form>
    <div className="action-row">{(flow==='sign in'?['create','reset']:['sign in']).map(f=><button key={f} className="text-link" onClick={()=>{setFlow(f);setNotice('')}}>{f==='reset'?'Forgot password?':f==='create'?'Create email account':'Back to sign-in'}</button>)}</div>{notice&&<p role="status">{notice}</p>}</div>
}

export default function Office({refreshPublic}){
  const [user,setUser]=useState(undefined),[dash,setDash]=useState(null),[tab,setTab]=useState('Overview'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const load=async (account=auth.currentUser,claim=false)=>{
    if(!account?.emailVerified)return
    if(claim) await call('ClaimInvite')
    const data=await call('Dashboard')
    if(auth.currentUser?.uid===account.uid)setDash(data)
  }
  useEffect(()=>{
    const off=onAuthStateChanged(auth,u=>{setUser(u);setDash(null);setNotice('');setTab('Overview');if(u)load(u,true).catch(e=>setNotice(errorText(e)))})
    const interval=setInterval(()=>{if(auth.currentUser?.emailVerified)load().catch(e=>{setDash(null);setNotice(errorText(e))})},60000)
    return ()=>{off();clearInterval(interval)}
  },[])
  const act=async (fn,message='Saved.')=>{
    setNotice('');setBusy(true)
    try{const result=await fn();setNotice(message);await Promise.all([load(),refreshPublic()]);return result}
    catch(e){setNotice(errorText(e));return null}
    finally{setBusy(false)}
  }
  const mutate=(action,data,message)=>act(()=>api('Mutate',{action,...data}),message)
  const title=<Head eyebrow="CFL STAFF" title="League Office" description="The workspace for league administrators, town directors and coaches." action={user&&<button className="btn outline" onClick={()=>signOut(auth)}>Sign out</button>}/>
  if(user===undefined)return <>{title}<div className="loading" role="status">Checking your session…</div></>
  if(!user)return <>{title}<Account/></>
  if(!user.emailVerified)return <>{title}<div className="panel pad"><h2>Verify your email address</h2><p>Open the verification email sent to {user.email}, then return here.</p><div className="action-row"><button className="btn primary" disabled={busy} onClick={()=>act(async()=>{await user.reload();if(!user.emailVerified)throw new Error('Your email is still unverified.');await user.getIdToken(true);setUser(auth.currentUser);await load(user,true)},'Email verified.')}>I verified my email</button><button className="btn outline" disabled={busy} onClick={()=>act(()=>sendEmailVerification(user),'Verification email sent.')}>Resend email</button></div><p role="status">{notice}</p></div></>
  if(!dash?.role)return <>{title}<div className="panel pad"><h2>{dash?'No staff assignment found':'Checking staff access'}</h2><p>{notice|| (dash?'Ask a league administrator to assign access to '+user.email+'.':'The league service is checking your assignment.')}</p><button className="btn outline" disabled={busy} onClick={()=>act(()=>load(user,true),'Access refreshed.')}>Check again</button></div></>
  const admin=isAdmin(dash.role)
  const sections=admin?['Overview','Scores','Schedule requests','Rosters','League records','Staff access','Audit history']:dash.role.role==='director'?['Overview','Scores','Schedule requests','Rosters']:['Overview','Rosters']
  const props={dash,mutate,act,busy,notice}
  return <>{title}<div className="staff-bar"><div><Pill>{LABELS[dash.role.role]}</Pill> <span>{user.email}</span></div><button className="text-link" disabled={busy} onClick={()=>act(()=>load(),'Workspace refreshed.')}>Refresh</button></div>
    <nav className="office-tabs" aria-label="League Office sections">{sections.map(name=><button key={name} className="btn outline" aria-current={tab===name?'page':undefined} onClick={()=>{setTab(name);setNotice('')}}>{name}</button>)}</nav>
    {notice&&<div className="office-notice" role="status">{notice}</div>}
    {tab==='Overview'&&<Overview dash={dash} setTab={setTab}/>}
    {tab==='Scores'&&<Scores {...props}/>}
    {tab==='Schedule requests'&&<Requests {...props}/>}
    {tab==='Rosters'&&<Rosters {...props}/>}
    {tab==='League records'&&<Records {...props}/>}
    {tab==='Staff access'&&<Roles {...props}/>}
    {tab==='Audit history'&&<Audit/>}
  </>
}
function Overview({dash,setTab}){
  const db=dash.records
  const admin=isAdmin(dash.role)
  const pending=dash.games.filter(g=>g.status==='pending'||g.status==='disputed')
  const rosters=dash.rosters.filter(r=>r.players.length)
  const open=dash.requests.filter(r=>r.status==='open')
  const upcoming=dash.games.filter(g=>g.status==='scheduled'&&g.day>=localDay()).sort(byDate).slice(0,6)
  const active=db.seasons.find(x=>x.status==='active')
  const metrics=dash.role.role==='coach'?[[Users,'Assigned rosters',dash.rosters.length,'Rosters'],[ClipboardList,'Rosters with players',rosters.length,'Rosters']]:[[Flag,'Scores to review',pending.length,'Scores'],[CalendarDays,'Open schedule requests',open.length,'Schedule requests'],[Users,'Rosters with players',rosters.length,'Rosters'],...(admin?[[ClipboardList,'League teams',db.teams.length,'League records']]:[])]
  return <><div className="office-metrics">{metrics.map(([Icon,label,n,tab])=><button key={label} className="panel pad" onClick={()=>setTab(tab)}><Icon size={22}/><strong>{n}</strong><span>{label}</span></button>)}</div><div className="panel pad"><h2>{active?.name||'League workspace'}</h2>{dash.role.role==='director'&&<p>Assigned towns: {dash.role.scopes.map(t=>label(db,'towns',t)).join(', ')}</p>}{dash.role.role==='coach'&&<p>Assigned teams: {dash.role.scopes.map(t=>label(db,'teams',t)).join(', ')}</p>}{dash.role.role!=='coach'&&<><h3>Upcoming games</h3>{upcoming.length?upcoming.map(g=><p key={g.id}>{displayDate(g.day)} · {matchup(db,g)}</p>):<p>No upcoming games are published for these assignments.</p>}</>}</div></>
}

function Scores({dash,mutate,busy}){
  const [filter,setFilter]=useState(''),[chosen,setChosen]=useState(''),[audit,setAudit]=useState(false),[show,setShow]=useState(30),[scope,setScope]=useState('')
  const db=dash.records
  const admin=isAdmin(dash.role)
  const g=dash.games.find(x=>x.id===chosen)
  const gameOptions=dash.games.filter(x=>(!scope||x.status===scope)&&(!filter||[matchup(db,x),label(db,'divisions',x.division),x.day].join(' ').toLowerCase().includes(filter.toLowerCase()))).sort((a,b)=>Number(['pending','disputed'].includes(b.status))-Number(['pending','disputed'].includes(a.status))||byDate(b,a))
  return <><div className="filters compact"><label className="field-label">Find a game<input value={filter} placeholder="Town, grade or date" onChange={e=>{setFilter(e.target.value);setShow(30)}}/></label><Select label="Game status" value={scope} onChange={setScope} options={Object.entries(GAME_STATUS).map(([id,name])=>({id,name}))}/></div>
    {g&&<div className="panel pad office-editor"><div className="action-row between"><div><span className="eyebrow">{label(db,'divisions',g.division)}</span><h2>{matchup(db,g)}</h2></div><button className="icon-btn" aria-label="Close score editor" onClick={()=>{setChosen('');setAudit(false)}}><X size={18}/></button></div><p>{displayDate(g.day)} · {formatStatus(g)}</p><ScoreEditor key={g.id+'-'+g.revision} {...{dash,g,busy,mutate}}/><button className="text-link" onClick={()=>setAudit(!audit)}><History size={16}/>{audit?'Hide':'Show'} game audit history</button>{audit&&<Audit key={g.id+'-'+g.revision} game={g.id}/>}</div>}
    {gameOptions.length?<div className="office-list">{gameOptions.slice(0,show).map(g=><button className="office-list-row panel pad" key={g.id} onClick={()=>{setChosen(g.id);setAudit(false);window.scrollTo(0,0)}}><div><b>{matchup(db,g)}</b><small>{displayDate(g.day)} · {label(db,'divisions',g.division)}</small></div><Pill>{formatStatus(g)}</Pill><ArrowRight size={17}/></button>)}</div>:<Empty title="No matching games"/>}{show<gameOptions.length&&<button className="btn outline load-more" onClick={()=>setShow(show+30)}>Show more games</button>}</>
}
function ScoreEditor({dash,g,busy,mutate}){
  const admin=isAdmin(dash.role)
  const scope=sides(dash.role,g,dash.records.teams)
  const review=g.status==='pending'&&scope.length===1&&scope[0]!==g.proposal?.side&&g.proposal?.uid!==dash.role.id
  const canSubmit=scope.length>0&&['scheduled','in_progress'].includes(g.status)
  const actions=admin?(g.official||g.proposal||g.dispute?['override','reset']:['override']):review?['confirm','dispute']:canSubmit?['submit']:[]
  const [action,setAction]=useState(actions[0]||''),[side,setSide]=useState(scope[0]||'')
  const archived=find(dash.records,'seasons',g.season)?.status==='archived'
  const send=e=>{
    e.preventDefault()
    const f=new FormData(e.currentTarget)
    if(['override','reset'].includes(action)&&!confirm(action==='reset'?'Clear the reported result and reopen this game?':'Apply this official score correction?'))return
    mutate('score',{id:g.id,scoreAction:action,expected:g.revision??0,side,home:Number(f.get('home')),away:Number(f.get('away')),overtime:f.get('overtime')==='on',forfeit:f.get('forfeit')==='on',reason:String(f.get('reason')||'')},action==='submit'?'Score submitted for opposing confirmation.':action==='dispute'?'Dispute sent to league administrators.':action==='reset'?'Game result reset.':'Official result saved.')
  }
  return <>{g.official&&<p><b>Official score</b> {score(g.official)}</p>}{g.proposal&&<p><b>Submitted score</b> {score(g.proposal)} {g.proposal.reason&&'· '+g.proposal.reason}</p>}{g.dispute&&<p><b>Disputed score</b> {score(g.dispute)} · {g.dispute.reason}</p>}
    {!actions.length||archived&&!admin||g.bye||!g.home||!g.away||['canceled','postponed'].includes(g.status)?<p>{g.status==='pending'?'This score is waiting for the opposing director or league administration.':'There are no score actions for this game and assignment.'}</p>:<form className="office-form form-grid" onSubmit={send}>
    <Select label="Score action" value={action} onChange={setAction} options={actions.map(id=>({id,name:{override:'Finalize or correct',reset:'Reset reported result',confirm:'Confirm submitted score',dispute:'Dispute score',submit:'Submit score'}[id]}))} hideEmpty/>
    {scope.length>1&&action==='submit'&&<Select label="Report on behalf of" value={side} onChange={setSide} options={[{id:'home',name:'Home town'},{id:'away',name:'Away town'}]} hideEmpty/>}
    {!['confirm','reset'].includes(action)&&<><label className="field-label">Away score<input type="number" name="away" min="0" max="999" required defaultValue={g.dispute?.away??g.proposal?.away??g.official?.away??''}/></label><label className="field-label">Home score<input type="number" name="home" min="0" max="999" required defaultValue={g.dispute?.home??g.proposal?.home??g.official?.home??''}/></label><label className="check"><input type="checkbox" name="overtime" defaultChecked={g.dispute?.overtime??g.proposal?.overtime??g.official?.overtime}/> Overtime</label>{admin&&<label className="check"><input type="checkbox" name="forfeit" defaultChecked={g.status==='forfeited'}/> Forfeit</label>}</>}
    {action!=='confirm'&&<label className="field-label span-all">Reason or notes<textarea name="reason" maxLength={700} required={action!=='submit'}/></label>}
    <button disabled={busy} className="btn primary">{action==='confirm'?'Confirm official score':action==='dispute'?'Send dispute':action==='submit'?'Submit for review':action==='reset'?'Reset game result':'Save official result'}</button>
  </form>}</>
}
function Audit({game}){
  const [data,setData]=useState(null),[error,setError]=useState('')
  const load=async(cursor)=>{try{const next=await call('Audit',{game:game??null,cursor:cursor??null});setData(old=>cursor?{...next,entries:[...old.entries,...next.entries]}:next)}catch(e){setError(errorText(e))}}
  useEffect(()=>{load()},[game])
  if(error)return <p role="alert">{error}</p>
  if(!data)return <div className="loading">Loading audit history…</div>
  if(!data.entries.length)return <Empty title="No audit entries yet" icon={History}/>
  return <div className="audit-list">{data.entries.map(a=><article key={a.id} className="panel pad"><div className="action-row between"><h3>{a.action}</h3><time>{displayAt(a.at)}</time></div><p>{a.actor} · {LABELS[a.role]||a.role} · {a.kind} / {a.key}</p>{a.reason&&<p>{a.reason}</p>}{a.kind==='games'&&<p>Before {score(a.before?.official||a.before?.proposal)} · After {score(a.after?.official||a.after?.dispute||a.after?.proposal)}</p>}<details><summary>View recorded changes</summary><pre>{JSON.stringify({before:a.before,after:a.after},null,2)}</pre></details></article>)}{data.cursor&&<button className="btn outline" onClick={()=>load(data.cursor)}>Older entries</button>}</div>
}

function Requests({dash,busy,mutate}){
  const [game,setGame]=useState('')
  const admin=isAdmin(dash.role),db=dash.records
  const options=dash.games.filter(g=>find(db,'seasons',g.season)?.status!=='archived').sort((a,b)=>byDate(b,a)).map(g=>({id:g.id,name:displayDate(g.day)+' · '+matchup(db,g)+' · '+label(db,'divisions',g.division)}))
  return <>{!admin&&<form className="panel pad office-form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);if(await mutate('scheduleRequest',{id:game,details:f.get('details')},'Schedule request submitted.')){form.reset();setGame('')}}}><h2>Request a schedule change</h2><Select label="Game" value={game} onChange={setGame} options={options} empty="Choose a game"/><label className="field-label">Requested change and reason<textarea name="details" required maxLength={1500}/></label><button className="btn primary" disabled={busy||!game}>Send request</button></form>}
    <div className="audit-list">{[...dash.requests].sort((a,b)=>b.at.localeCompare(a.at)).map(r=><article className="panel pad" key={r.id}><div className="action-row between"><h3>{matchup(db,dash.games.find(g=>g.id===r.game))}</h3><Pill>{r.status}</Pill></div><p>{r.email} · {displayAt(r.at)}</p><p>{r.details}</p>{r.reason&&<p>{r.reason}</p>}{admin&&r.status==='open'&&<form className="office-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget,e.nativeEvent.submitter);mutate('requestDecision',{id:r.id,status:f.get('decision'),reason:f.get('reason')},'Request decision saved. Apply any approved changes in League records.')}}><label className="field-label">Decision note<input name="reason" maxLength={700} required/></label><div className="action-row"><button name="decision" value="approved" className="btn primary" disabled={busy}>Approve</button><button name="decision" value="declined" className="btn outline" disabled={busy}>Decline</button></div></form>}</article>)}</div>
    {!dash.requests.length&&<Empty title="No schedule requests" icon={CalendarDays}/>}</>
}

const csvCell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r\n]/,m=>"'"+m).replaceAll('"','""')+'"'
const toCsv=(header,rows)=>[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')
function Rosters({dash,mutate,busy}){
  const [team,setTeam]=useState('')
  const admin=isAdmin(dash.role),db=dash.records
  const options=db.teams.filter(t=>canSeeRoster(dash.role,t))
  const roster=dash.rosters.find(r=>r.id===team)
  const selected=find(db,'teams',team)
  const [exportNote,setExportNote]=useState('')
  const exportRoster=async()=>{try{
    setExportNote('Preparing export…')
    const data=await api('Mutate',{action:'rosterExport',id:team})
    download('CFL-roster-'+team+'.csv',new Blob([toCsv(['Player','Jersey','Grade','Position','Status','Exported by','Exported at'],data.players.map(p=>[p.name,p.jersey,p.grade,p.position,p.status,data.actor,data.exportedAt]))],{type:'text/csv'}))
    setExportNote('Export started.')
  }catch(e){setExportNote(errorText(e))}}
  return <><div className="filters compact"><Select label="Private team roster" value={team} onChange={v=>{setTeam(v);setExportNote('')}} options={options.map(t=>({...t,name:t.name+' · '+label(db,'divisions',t.division)}))} empty="Choose a team"/></div>{!selected?<Empty title="Choose an assigned team" icon={Users}>Player information is restricted to authorized staff.</Empty>:<><div className="action-row between"><h2>{selected.name}</h2><button className="btn outline" onClick={exportRoster}><FileDown size={16}/> Export roster</button></div><p role="status">{exportNote}</p><RosterEditor key={team+(roster?.updatedAt||'')} {...{team,roster,admin,busy,mutate}} archived={find(db,'seasons',selected.season)?.status==='archived'}/></>}</>
}
function RosterEditor({team,roster,admin,busy,mutate,archived}){
  const [players,setPlayers]=useState(()=> (roster?.players||[]).map(p=>({...p,key:unique()})))
  const change=(key,field,v)=>setPlayers(rows=>rows.map(p=>p.key===key?{...p,[field]:v}:p))
  return <form className="office-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(confirm('Save the private roster for this team?'))mutate('roster',{id:team,version:roster?.updatedAt||'',players:players.map(({key,...p})=>p),reason:String(f.get('reason')||'')},'Private roster saved.')}}>
    {players.length?(admin?<div className="roster-grid">{players.map((p,i)=><div className="panel pad player-row" key={p.key}><label className="field-label">Player {i+1}<input value={p.name} required maxLength={110} onChange={e=>change(p.key,'name',e.target.value)}/></label><label className="field-label">Jersey<input type="number" min="0" max="999" value={p.jersey} onChange={e=>change(p.key,'jersey',e.target.value)}/></label><Select label="Grade" value={String(p.grade)} onChange={v=>change(p.key,'grade',v)} options={['1','2','3','4','5','6']} hideEmpty/><label className="field-label">Position<input value={p.position} maxLength={40} onChange={e=>change(p.key,'position',e.target.value)}/></label><Select label="Status" value={p.status} onChange={v=>change(p.key,'status',v)} options={['active','inactive']} hideEmpty/><button className="icon-btn" type="button" aria-label={'Remove player '+(i+1)} onClick={()=>{if(confirm('Remove this player from the draft roster?'))setPlayers(rows=>rows.filter(x=>x.key!==p.key))}}><X size={17}/></button></div>)}</div>:<div className="table-wrap"><table><thead><tr>{['Player','Jersey','Grade','Position','Status'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{players.map(p=><tr key={p.key}><td>{p.name}</td><td>{p.jersey||'—'}</td><td>{p.grade}</td><td>{p.position||'—'}</td><td>{p.status}</td></tr>)}</tbody></table></div>):<Empty title="No players in this roster" icon={Users}/>}
    {admin&&<><label className="field-label">Change note<input name="reason" required={archived} maxLength={700}/></label><div className="action-row"><button className="btn outline" type="button" disabled={players.length>=100} onClick={()=>setPlayers(rows=>[...rows,{key:unique(),name:'',jersey:'',grade:1,position:'',status:'active'}])}><Plus size={17}/> Add player</button><button className="btn primary" disabled={busy}>Save roster</button></div></>}
  </form>
}

function Roles({dash,mutate,busy}){
  const [email,setEmail]=useState(''),[role,setRole]=useState('director'),[scopes,setScopes]=useState([]),[lookup,setLookup]=useState(''),[reason,setReason]=useState('')
  const superadmin=dash.role.role==='superadmin'
  const roles=['director','coach',...(superadmin?['admin']:[])]
  const options=role==='director'?dash.records.towns:dash.records.teams.map(t=>({...t,name:t.name+' · '+label(dash.records,'divisions',t.division)}))
  const search=async()=>{try{const result=await call('LookupUser',{email});setLookup(result.disabled?'The Auth account is disabled.':result.verified?'Verified account found.':result.exists?'Account found. Email verification is pending.':'No account found. Save an invitation for this email.')}catch(e){setLookup(errorText(e))}}
  return <><form className="panel pad office-form" onSubmit={e=>{e.preventDefault();mutate('assign',{email,role,scopes,reason},'Staff assignment or invitation saved.')}}><h2>Assign staff access</h2><div className="form-grid"><label className="field-label">Staff email<input type="email" value={email} onChange={e=>{setEmail(e.target.value);setLookup('')}} required/></label><Select label="Role" value={role} onChange={v=>{setRole(v);setScopes([])}} options={roles.map(id=>({id,name:LABELS[id]}))} hideEmpty/></div><button className="btn outline" type="button" onClick={search} disabled={!email}><Search size={16}/> Look up account</button>{lookup&&<p role="status">{lookup}</p>}
    {role!=='admin'&&<fieldset><legend>{role==='director'?'Assigned towns':'Assigned teams'}</legend><div className="checks">{options.map(o=><label className="check" key={o.id}><input type="checkbox" checked={scopes.includes(o.id)} onChange={e=>setScopes(s=>e.target.checked?[...s,o.id]:s.filter(x=>x!==o.id))}/>{o.name}</label>)}</div></fieldset>}
    <label className="field-label">Assignment note<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={700}/></label><p>Invited staff sign in with the assigned email and verify the address to activate access.</p><button className="btn primary" disabled={busy||role!=='admin'&&!scopes.length}>Save assignment</button></form>
    <div className="office-list">{[...dash.roles,...dash.invites.map(r=>({...r,invitation:true}))].map(r=><div className="panel pad office-list-row" key={r.id}><div><b>{r.email}</b><small>{LABELS[r.role]} · {r.invitation?'Invitation pending':r.active?'Active':'Revoked'}{r.scopes?.length?' · '+r.scopes.map(id=>label(dash.records,r.role==='director'?'towns':'teams',id,id)).join(', '):''}</small><small>{r.updatedBy?'Changed by '+(dash.roles.find(user=>user.id===r.updatedBy)?.email||r.updatedBy)+' · ':''}{displayAt(r.updatedAt)}</small></div>{r.active&&roles.includes(r.role)&&<button className="btn outline" disabled={busy} onClick={()=>{const note=prompt('Enter a reason for revoking access to '+r.email+'.');if(note?.trim()&&confirm('Revoke this assignment?'))mutate('revoke',{email:r.email,reason:note},'Staff access revoked.')}}>Revoke</button>}</div>)}</div>
  </>
}

const T=(key,label=key,type='text',required=false)=>({key,label,type,required})
const O=(key,label,options,required=false)=>({key,label,type:'select',options,required})
const R=(key,label,ref,required=false)=>({key,label,type:'select',ref,required})
const Y=(key,label)=>T(key,label,'check')
const configs={
  seasons:[T('name','Season name','text',true),T('year','Year','number',true),O('status','Season status',['draft','active','archived'],true),T('start','Start date','date'),T('end','End date','date'),T('conferences','Conferences (comma separated)','list'),O('scheduleMode','Schedule format',['both','town','independent'],true),T('breakers','Tiebreaker order','breakers'),T('pointCap','Conference margin cap','number'),T('overtimePoints','Overtime margin points','number'),O('forfeitPolicy','Forfeiture treatment',[{id:'unconfigured',name:'Awaiting league policy'},{id:'exclude',name:'Exclude from standings'},{id:'score',name:'Count official score'}],true),T('rulesUrl','Rules URL','url'),Y('showPending','Show pending status publicly'),T('notes','Public rule explanation','textarea')],
  towns:[T('name','Town name','text',true),T('mascot','Mascot'),T('color','Accent color (hex)'),T('logo','Logo URL','url'),T('contact','Approved public contact'),T('contactUrl','Contact URL','url'),Y('active','Active member')],
  venues:[T('name','Venue name','text',true),R('town','Town','towns'),T('address','Address','text',true),T('field','Default field identifier'),T('parking','Parking notes','textarea'),T('entrance','Entrance notes','textarea'),T('directions','Directions URL','url')],
  divisions:[T('name','Grade division name','text',true),R('season','Season','seasons',true),T('order','Display order','number',true),T('breakers','Override season tiebreakers','breakers'),T('notes','Public rule explanation','textarea')],
  teams:[T('name','Team display name','text',true),R('season','Season','seasons',true),R('town','Town','towns',true),R('division','Grade division','divisions',true),O('conference','Conference',[]),T('coach','Approved public coach name'),Y('active','Active team')],
  events:[T('name','Event name','text',true),R('season','Season','seasons',true),T('week','Week','number',true),T('day','Game day','date',true),R('awayTown','Away town','towns',true),R('homeTown','Home town','towns',true),R('venue','Venue','venues'),T('notes','Event notes','textarea')],
  games:[R('season','Season','seasons',true),R('division','Grade division','divisions',true),R('away','Away team','teams'),R('home','Home team','teams'),T('week','Week','number',true),T('day','Game day','date'),T('kickoff','Kickoff (Central Time)','datetime-local'),T('duration','Field occupancy (minutes)','number',true),R('venue','Venue','venues'),T('field','Field identifier'),R('event','Town event','events'),O('type','Game type',['regular','playoff','championship'],true),O('status','Schedule status',['scheduled','in_progress','postponed','canceled'],true),R('bracket','Playoff bracket','brackets'),T('round','Bracket round','number'),Y('bye','Award a bracket bye'),T('awaySeed','Away seed or slot'),T('homeSeed','Home seed or slot'),R('awayFrom','Away feeder game','games'),R('homeFrom','Home feeder game','games'),T('notes','Public game notes','textarea')],
  brackets:[T('name','Bracket name','text',true),R('season','Season','seasons',true),R('division','Grade division','divisions',true),T('qualifiers','Number of qualifiers','number',true),Y('locked','Lock bracket structure'),T('notes','Seeding, byes and format notes','textarea')],
  championships:[R('season','Season','seasons',true),R('division','Grade division','divisions',true),R('winnerTown','Winning town','towns'),T('winnerName','Champion name'),T('runnerUp','Runner-up'),R('game','Championship game','games'),O('verification','Verification',['review','verified','unknown'],true),T('notes','Archive notes','textarea')],
  announcements:[T('name','Headline','text',true),R('season','Season','seasons'),T('day','Publish date','date'),T('body','Announcement','textarea',true),T('url','More information URL','url')],
  documents:[T('name','Document name','text',true),T('category','Category','text',true),T('url','Document URL','url'),T('notes','Description','textarea')]
}
const defaults={status:'draft',scheduleMode:'both',pointCap:8,overtimePoints:1,forfeitPolicy:'unconfigured',order:1,duration:90,week:1,type:'regular',round:1,qualifiers:8,active:true,verification:'review'}
function Field({spec,value,onChange,options,disabled}){
  const {type,label,required}=spec
  if(type==='check')return <label className="check"><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)} disabled={disabled}/>{label}</label>
  if(type==='breakers'){
    const selected=value||[]
    const add=e=>{if(e.target.value)onChange([...selected,e.target.value])}
    return <fieldset className="span-all"><legend>{label}</legend>{selected.map((id,i)=><div key={id} className="action-row breaker"><span>{i+1}. {BREAKERS[id]}</span><button type="button" className="text-link" disabled={i===0} onClick={()=>{const next=[...selected];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(next)}}>Move up</button><button type="button" className="text-link" onClick={()=>onChange(selected.filter(x=>x!==id))}>Remove</button></div>)}<label className="field-label">Add tiebreaker<select value="" onChange={add}><option value="">Choose a metric</option>{Object.entries(BREAKERS).filter(([k])=>!selected.includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></fieldset>
  }
  if(type==='select')return <label className="field-label">{label}<select required={required} disabled={disabled} value={value??''} onChange={e=>onChange(e.target.value)}><option value="">Choose…</option>{options.map(o=><option key={o.id??o} value={o.id??o}>{o.name??o}</option>)}</select></label>
  if(type==='textarea')return <label className="field-label span-all">{label}<textarea required={required} maxLength={5000} value={value??''} onChange={e=>onChange(e.target.value)}/></label>
  return <label className="field-label">{label}<input type={type==='list'?'text':type} required={required} value={value??''} onChange={e=>onChange(e.target.value)}/></label>
}
function formatRecord(kind,row){
  const values={...defaults,...row}
  if(kind==='games'){values.status=['scheduled','in_progress','postponed','canceled'].includes(row.status)?row.status:'scheduled';values.kickoff=row.kickoff?localDateTime(row.kickoff):''}
  if(kind==='seasons')values.conferences=row.conferences?.join(', ')||''
  return values
}
function formRecord(kind,values){
  const record={}
  for(const f of configs[kind]){
    const v=values[f.key]
    if(f.type==='number'){if(v!==''&&v!==undefined)record[f.key]=Number(v)}
    else if(f.type==='list') record[f.key]=String(v||'').split(',').map(x=>x.trim()).filter(Boolean)
    else if(v!==undefined)record[f.key]=v
  }
  return {...record,id:values.id,published:!!values.published,source:values.source||'',...(kind==='documents'&&values.storagePath?{storagePath:values.storagePath}:{})}
}
function RecordEditor({db,kind,row,busy,mutate,act,onSaved,cancel,role}){
  const [values,setValues]=useState(()=>formatRecord(kind,row))
  const [reason,setReason]=useState(''),[file,setFile]=useState(null)
  const season=find(db,'seasons',row.season||row.id)
  const scoped=spec=>{
    if(spec.key==='conference')return find(db,'seasons',values.season)?.conferences||[]
    if(!spec.ref)return spec.options||[]
    let options=db[spec.ref]||[]
    if(['teams','brackets','games','divisions','events'].includes(spec.ref) && values.season) options=options.filter(r=>r.season===values.season)
    if(['teams','brackets','games'].includes(spec.ref)&&values.division)options=options.filter(r=>r.division===values.division)
    if(spec.key.endsWith('From'))options=options.filter(g=>g.id!==row.id&&g.bracket&&g.bracket===values.bracket&&g.round<Number(values.round))
    if(spec.key==='game')options=options.filter(g=>g.type==='championship')
    return options.map(r=>({...r,name:rowTitle(db,spec.ref,r)+(spec.ref==='games'?' · '+(r.day||r.id):'')}))
  }
  const save=async e=>{
    e.preventDefault()
    if((row.published&&!values.published || values.status==='archived'&&row.status!=='archived'||kind==='games'&&values.status==='canceled')&&!confirm('Apply this change to the league record?'))return
    const record=formRecord(kind,values)
    if(kind==='documents'&&file){
      const reader=new FileReader()
      const encode=new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject})
      reader.readAsDataURL(file)
      const result=await act(async()=>api('Upload',{id:record.id,record,version:row.updatedAt||'',reason,mime:file.type,base64:await encode}),'Document saved.')
      if(result)onSaved(record.id)
    }else{
      const result=await mutate('save',{kind,record,reason,version:row.updatedAt||''},'League record saved.')
      if(result)onSaved(record.id)
    }
  }
  const set=(key,v)=>setValues(prev=>({...prev,[key]:v,...(key==='season'?{division:'',conference:'',away:'',home:'',event:'',bracket:'',awayFrom:'',homeFrom:''}:key==='division'?{away:'',home:'',bracket:'',awayFrom:'',homeFrom:''}:key==='bracket'?{awayFrom:'',homeFrom:''}:{})}))
  const played=kind==='seasons'&&row.id&&db.games.some(g=>g.season===row.id&&hasScore(g))
  return <form className="panel pad office-form form-grid office-editor" onSubmit={save}>
    <div className="action-row between span-all"><h2>{row.updatedAt?'Edit':'New'} {kinds[kind].toLowerCase().replace(/s$/,'')}</h2><button type="button" className="icon-btn" aria-label="Close editor" onClick={cancel}><X size={18}/></button></div>
    {played&&<p className="span-all">Games have official results. Include a reason for any standings rule change.</p>}
    {kind==='games'&&row.official&&<p className="span-all">Official result {score(row.official)}. Use the Scores workspace to correct it.</p>}
    {configs[kind].filter(f=>f.key!=='showPending'||role.role==='superadmin').map(f=><Field key={f.key} spec={f} value={values[f.key]} onChange={v=>set(f.key,v)} options={scoped(f)}/>)}
    {kind==='documents'&&<label className="field-label span-all">Upload PDF, PNG or JPEG (5 MB maximum)<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files[0];if(f?.size>5242880){e.target.setCustomValidity('Choose a file up to 5 MB.');setFile(null)}else{e.target.setCustomValidity('');setFile(f||null)}}}/></label>}
    <label className="field-label">Source or verification URL<input type="url" value={values.source||''} onChange={e=>set('source',e.target.value)}/></label>
    <label className="check"><input type="checkbox" checked={!!values.published} onChange={e=>set('published',e.target.checked)}/> Publish this record</label>
    <label className="field-label span-all">Audit note<input required={season?.status==='archived'} value={reason} maxLength={700} onChange={e=>setReason(e.target.value)}/></label>
    <div className="action-row span-all"><button className="btn primary" disabled={busy}>Save record</button><button type="button" className="btn outline" onClick={cancel}>Close</button></div>
  </form>
}
function parseCsv(raw){
  const rows=[];let cell='',row=[],quoted=false
  for(let i=0;i<raw.length;i++){
    const c=raw[i]
    if(c==='"'&&quoted&&raw[i+1]==='"'){cell+='"';i++}
    else if(c==='"'&&(quoted||!cell))quoted=!quoted
    else if(!quoted&&(c===','||c==='\r'||c==='\n')){
      row.push(cell);cell=''
      if(c!==','){if(c==='\r'&&raw[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[]}
    }else cell+=c
  }
  if(quoted)throw new Error('A quoted cell is missing its closing quote.')
  if(row.length||cell){row.push(cell);if(row.some(Boolean))rows.push(row)}
  return rows
}
const csvFields=['id','season','division','week','day','kickoff','duration','venue','field','away','home','event','type','status','published','notes']
function Csv({db,busy,mutate}){
  const [rows,setRows]=useState([]),[errors,setErrors]=useState([]),[reason,setReason]=useState('')
  const preview=async e=>{
    const file=e.target.files[0];setRows([]);setErrors([])
    if(!file)return
    try{
      if(file.size>160000)throw new Error('Use a CSV smaller than 160 KB.')
      const [headers,...entries]=parseCsv((await file.text()).replace(/^\uFEFF/,''))
      if(!headers||!['season','division','week','home','away'].every(h=>headers.includes(h)))throw new Error('Use the schedule CSV headers. Season, division, week, home and away are required.')
      if(!entries.length||entries.length>40)throw new Error('Import 1–40 games at a time.')
      const staged={...db,games:[...db.games]}
      const valid=[],problems=[]
      entries.forEach((entry,i)=>{
        try{
          if(entry.length!==headers.length)throw new Error('The number of cells differs from the header.')
          const x=Object.fromEntries(headers.map((h,j)=>[h.trim(),entry[j].trim()]))
          const record={...x,id:x.id||unique(),week:Number(x.week),duration:x.duration?Number(x.duration):90,type:x.type||'regular',status:x.status||'scheduled',published:['true','yes','1'].includes(x.published?.toLowerCase())}
          if(staged.games.some(g=>g.id===record.id))throw new Error('Game ID already exists. Remove the ID to create a new fixture.')
          const normalized=normalize('games',record,staged)
          staged.games.push(normalized);valid.push(record)
        }catch(e){problems.push('Row '+(i+2)+'. '+errorText(e))}
      })
      setRows(valid);setErrors(problems)
    }catch(e){setErrors([errorText(e)])}
  }
  const exportCsv=(template=false)=>{
    const games=template?[]:db.games
    const value=(g,k)=>k==='kickoff'&&g.kickoff?localDateTime(g.kickoff):k==='status'&&!['scheduled','in_progress','postponed','canceled'].includes(g.status)?'scheduled':g[k]
    download(template?'CFL-schedule-template.csv':'CFL-schedule.csv',new Blob([toCsv(csvFields,games.map(g=>csvFields.map(k=>value(g,k))))],{type:'text/csv'}))
  }
  return <details className="panel pad csv-panel"><summary>Schedule CSV import and export</summary><div className="action-row"><button className="btn outline" type="button" onClick={()=>exportCsv(true)}>Download blank CSV</button><button className="btn outline" type="button" onClick={()=>exportCsv(false)}>Export schedule CSV</button></div><p>Use record IDs from League records. Kickoff values use Central Time in YYYY-MM-DDTHH:mm format. Imports add games in a single transaction.</p><label className="field-label">Choose CSV for validation<input type="file" accept=".csv,text/csv" onChange={preview}/></label>{errors.length>0&&<ul className="error">{errors.map(x=><li key={x}>{x}</li>)}</ul>}{rows.length>0&&<><p>{rows.length} games passed validation.</p><div className="csv-preview">{rows.map(r=><p key={r.id}>{r.day||r.kickoff||'Date TBA'} · {matchup(db,r)} · {r.published?'Published':'Draft'}</p>)}</div><label className="field-label">Import note<input value={reason} maxLength={700} onChange={e=>setReason(e.target.value)}/></label><button className="btn primary" disabled={busy||!!errors.length} onClick={async()=>{if(confirm('Import '+rows.length+' games?')&&await mutate('bulk',{kind:'games',rows,reason},'Schedule import saved.'))setRows([])}}>Import {rows.length} games</button></>}</details>
}
function Records({dash,busy,mutate,act}){
  const [kind,setKind]=useState('games'),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState(30)
  const db=dash.records
  const rows=db[kind].filter(r=>[rowTitle(db,kind,r),r.id,r.day,r.season].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>kind==='games'?byDate(b,a):rowTitle(db,kind,a).localeCompare(rowTitle(db,kind,b)))
  const row=find(db,kind,selected)
  const [newId,setNewId]=useState('')
  const editing=selected==='new'?{id:newId}:row
  return <><div className="filters compact"><Select label="Manage" value={kind} onChange={k=>{setKind(k);setSelected('');setSearch('');setLimit(30)}} options={KINDS.map(id=>({id,name:kinds[id]}))} hideEmpty/><label className="field-label">Filter records<input value={search} onChange={e=>{setSearch(e.target.value);setLimit(30)}}/></label><button className="btn primary" onClick={()=>{setNewId(unique());setSelected('new');window.scrollTo(0,0)}}><Plus size={16}/> New record</button></div>
    {kind==='games'&&<Csv db={db} busy={busy} mutate={mutate}/>}
    {editing&&<RecordEditor key={kind+editing.id+(editing.updatedAt||'')} db={db} kind={kind} row={editing} busy={busy} mutate={mutate} act={act} role={dash.role} cancel={()=>setSelected('')} onSaved={setSelected}/>}
    {rows.length?<div className="office-list">{rows.slice(0,limit).map(r=><button className="panel pad office-list-row" key={r.id} onClick={()=>{setSelected(r.id);window.scrollTo(0,0)}}><div><b>{rowTitle(db,kind,r)}</b><small>{r.day?displayDate(r.day)+' · ':''}{r.id}</small></div><Pill>{r.published?'Published':'Draft'}</Pill><ArrowRight size={17}/></button>)}</div>:<Empty title="No matching records"/>}{rows.length>limit&&<button className="btn outline load-more" onClick={()=>setLimit(limit+30)}>Show more records</button>}</>
}
