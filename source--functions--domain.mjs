export const ZONE = 'America/Chicago'
export const KINDS = ['seasons','towns','divisions','teams','venues','events','games','brackets','championships','announcements','documents']
export const ADMIN = ['superadmin','admin']
export const LABELS = {superadmin:'Super Admin',admin:'Admin',director:'Town Director',coach:'Coach'}
export const BREAKERS = {record:'Win percentage',head:'Head-to-head',conference:'Conference win percentage',conferenceHead:'Conference head-to-head',conferencePoints:'Conference differential points',difference:'Point differential',pointsFor:'Points scored',pointsAgainst:'Fewest points allowed'}
export const GAME_STATUS = {scheduled:'Scheduled',in_progress:'In progress',postponed:'Postponed',canceled:'Canceled',pending:'Pending confirmation',disputed:'Disputed',final:'Final',forfeited:'Forfeited'}
export const isAdmin = role => ADMIN.includes(role?.role)
export const scopes = role => role?.scopes ?? []
export const canSeeRoster = (role,team) => !!team && (isAdmin(role) || (role?.role==='director' && scopes(role).includes(team.town)) || (role?.role==='coach' && scopes(role).includes(team.id)))
export const sides = (role,game,teams) => role?.role==='director' ? ['home','away'].filter(side=>scopes(role).includes(teams.find(team=>team.id===game[side])?.town)) : []
export function groupBy(rows,key){
  const result=new Map()
  for(const row of rows){
    const k=key(row)
    if(!result.has(k))result.set(k,[])
    result.get(k).push(row)
  }
  return result
}
export const includesTeam = (g,id) => g.home===id || g.away===id
export const hasScore = g => Number.isInteger(g?.official?.home) && Number.isInteger(g?.official?.away)
export const scoreEligible = (g,policy) => g.type==='regular' && (g.status==='final' || (g.status==='forfeited' && policy==='score')) && hasScore(g)
export const localDay = (value=Date.now()) => new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(value)
export const localDateTime = value => new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,dateStyle:'short',timeStyle:'short'}).format(new Date(value)).replace(' ','T')
export const displayDate = (day,options={weekday:'short',month:'short',day:'numeric'}) => day ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...options}).format(new Date(day+'T12:00:00Z')) : 'Date to be announced'
export const displayTime = iso => iso ? new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso)) : 'Kickoff TBA'

export function requireValue(ok,message,code='invalid-argument') {
  if (!ok) throw Object.assign(new Error(message),{code})
}
export function chicagoTime(value) {
  requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value),'Enter a valid Central Time kickoff.')
  const base = Date.parse(value+'Z')
  requireValue(Number.isFinite(base),'Enter a valid kickoff date.')
  const matches = [5,6].map(offset=>new Date(base+offset*3600000).toISOString()).filter(iso=>localDateTime(iso)===value)
  requireValue(matches.length===1,'Choose a kickoff outside the daylight-saving clock change.')
  return matches[0]
}
export function checkSchedule(game,games) {
  if (['canceled','postponed'].includes(game.status) || game.bye) return
  const start = Date.parse(game.kickoff)
  for (const other of games) {
    if (other.id===game.id || ['canceled','postponed'].includes(other.status) || other.bye) continue
    const otherStart = Date.parse(other.kickoff)
    const sameTeams = game.home && game.away && ((game.home===other.home && game.away===other.away) || (game.home===other.away && game.away===other.home))
    const sameSlot = game.kickoff && other.kickoff ? start===otherStart : game.day && game.day===other.day
    requireValue(!(sameTeams && sameSlot),'A fixture for these teams already exists at that kickoff.','already-exists')
    if (!game.kickoff || !other.kickoff) continue
    if (start>=otherStart+other.duration*60000 || otherStart>=start+game.duration*60000) continue
    requireValue(![game.home,game.away].filter(Boolean).some(id=>includesTeam(other,id)),'A team already plays during that time.','failed-precondition')
    requireValue(game.venue!==other.venue || game.field.toLowerCase()!==other.field.toLowerCase(),'That field is booked during this game.','failed-precondition')
  }
}
export function changeScore({game,role,actor,teams,action,home,away,reason,side,overtime,expected,forfeit,forfeitPolicy}) {
  requireValue(game,'Game not found.','not-found')
  requireValue(Number.isInteger(expected) && expected===(game.revision??0),'The game changed. Refresh and review the latest score.','aborted')
  const allowed = sides(role,game,teams)
  const admin = isAdmin(role)
  const prior = game.proposal
  if(action==='reset'){
    requireValue(admin,'Only league administrators can reset a result.','permission-denied')
    requireValue(reason,'A reset requires an explanation.')
    requireValue(game.official||game.proposal||game.dispute,'There is no reported result to reset.')
    return {...game,revision:expected+1,status:'scheduled',official:null,proposal:null,dispute:null}
  }
  requireValue(!game.bye && game.home && game.away && !['postponed','canceled'].includes(game.status),'This game cannot receive a score.','failed-precondition')
  requireValue(['submit','confirm','dispute','override'].includes(action),'Invalid score action.')
  if (action!=='confirm') requireValue([home,away].every(n=>Number.isInteger(n)&&n>=0&&n<=999),'Enter both scores as whole numbers from 0 to 999.')
  if (action==='submit') {
    requireValue(allowed.includes(side),'You can only report games for your assigned towns.','permission-denied')
    requireValue(['scheduled','in_progress'].includes(game.status),'This game already has a report or a final result.','failed-precondition')
    return {...game,revision:expected+1,status:'pending',proposal:{home,away,overtime:!!overtime,uid:actor,side,reason}}
  }
  if (action==='confirm' || action==='dispute') {
    requireValue(prior && game.status==='pending','This report is no longer awaiting confirmation.','failed-precondition')
    requireValue(allowed.length===1 && allowed[0]!==prior.side && actor!==prior.uid,'Only a different, opposing director can review this submission.','permission-denied')
    if (action==='dispute') {
      requireValue(reason,'A dispute requires an explanation.')
      return {...game,revision:expected+1,status:'disputed',dispute:{home,away,overtime:!!overtime,uid:actor,reason}}
    }
    home=prior.home; away=prior.away; overtime=prior.overtime; forfeit=false
  } else {
    requireValue(admin,'Only league administrators can finalize or correct a result.','permission-denied')
    requireValue(reason,'An override requires an explanation.')
  }
  requireValue(!forfeit || ['exclude','score'].includes(forfeitPolicy),'Set the league forfeiture policy before recording a forfeit.')
  requireValue(!forfeit || home!==away,'A forfeit must identify a winner.')
  requireValue(game.type==='regular' || home!==away,'Playoff games require a winner.')
  return {...game,revision:expected+1,status:forfeit?'forfeited':'final',official:{home,away,overtime:!!overtime},proposal:null,dispute:null}
}

export function standings(teams,games,options={}) {
  const records = new Map(teams.map(team=>[team.id,{team,w:0,l:0,t:0,pf:0,pa:0,cw:0,cl:0,ct:0,cp:0,played:0}]))
  const known=new Map((options.allTeams??teams).map(t=>[t.id,t]))
  const eligible = games.filter(g=>scoreEligible(g,options.forfeitPolicy) && known.has(g.home) && known.has(g.away))
  const cap = options.pointCap
  const ot = options.overtimePoints
  const pct = (w,l,t) => w+l+t ? (w+t/2)/(w+l+t) : 0
  for (const g of eligible) {
    const h=records.get(g.home), a=records.get(g.away)
    if (!h && !a) continue
    const home=known.get(g.home),away=known.get(g.away)
    const conference = !!home.conference && home.conference===away.conference
    const diff = g.official.home-g.official.away
    const margin = diff===0 ? 0 : Math.sign(diff)*(g.official.overtime && Number.isInteger(ot) ? ot : Number.isInteger(cap) ? Math.min(Math.abs(diff),cap) : Math.abs(diff))
    for (const [r,pf,pa,points] of [[h,g.official.home,g.official.away,margin],[a,g.official.away,g.official.home,-margin]]) {
      if (!r) continue
      const key = pf>pa?'w':pf<pa?'l':'t'
      r[key]++; r.pf+=pf; r.pa+=pa; r.played++
      if (conference) { r['c'+key]++; r.cp+=points }
    }
  }
  const list = [...records.values()].map(r=>({...r,pct:pct(r.w,r.l,r.t),confPct:pct(r.cw,r.cl,r.ct)}))
  const keys = options.breakers?.length ? options.breakers : []
  function order(rows,remaining) {
    if (rows.length<2 || remaining.length===0) return [rows.sort((a,b)=>a.team.name.localeCompare(b.team.name))]
    const [key,...rest]=remaining
    const metric = {record:r=>r.pct,conference:r=>r.confPct,conferencePoints:r=>r.cp,difference:r=>r.pf-r.pa,pointsFor:r=>r.pf,pointsAgainst:r=>-r.pa}[key]
    const ids=new Set(rows.map(r=>r.team.id))
    const head=eligible.filter(g=>ids.has(g.home)&&ids.has(g.away))
    const matches = key==='conferenceHead' ? head.filter(g=>records.get(g.home).team.conference && records.get(g.home).team.conference===records.get(g.away).team.conference) : head
    const h2h = r => {
      const played=matches.filter(g=>includesTeam(g,r.team.id))
      return played.length ? played.reduce((sum,g)=>{ const d=(g.official.home-g.official.away)*(g.home===r.team.id?1:-1); return sum+(d>0?1:d===0?.5:0) },0)/played.length : 0
    }
    const counts=rows.map(r=>matches.filter(g=>includesTeam(g,r.team.id)).length)
    const value = metric ?? (counts.every(n=>n===counts[0] && n>0) ? h2h : ()=>0)
    const groups=groupBy(rows,value)
    return [...groups.keys()].sort((a,b)=>b-a).flatMap(v=>order(groups.get(v),rest))
  }
  let rank=1
  return order(list,keys).flatMap(group=>{
    const result=group.map(r=>({...r,rank:keys.length && r.played?rank:null,tied:group.length>1}))
    rank+=group.length
    return result
  })
}

export function bracketUpdates(games,changed,forfeitPolicy) {
  if (!changed.bracket) return []
  const working=new Map(games.filter(g=>g.bracket===changed.bracket).map(g=>[g.id,g]))
  working.set(changed.id,changed)
  const updates=[]
  for (const game of [...working.values()].sort((a,b)=>a.round-b.round)) {
    const next={...game}
    for (const side of ['away','home']) {
      const feeder=working.get(game[side+'From'])
      if (!feeder) continue
      const decided=(feeder.status==='final' || (feeder.status==='forfeited' && forfeitPolicy==='score')) && hasScore(feeder)
      const bye=feeder.bye && feeder.status==='scheduled' && !!feeder.home!==!!feeder.away
      next[side]=bye ? (feeder.home||feeder.away) : decided ? feeder[feeder.official.home>feeder.official.away?'home':'away'] : ''
    }
    if (next.home===game.home && next.away===game.away) continue
    requireValue(!next.home || next.home!==next.away,'The bracket would advance one team to both slots.','failed-precondition')
    requireValue(!hasScore(game) && !game.proposal && !game.dispute,'Resolve or reset the downstream result before changing the advancing team.','failed-precondition')
    next.revision=(game.revision??0)+1
    checkSchedule(next,[...games.filter(g=>!working.has(g.id)),...working.values()])
    working.set(next.id,next); updates.push(next)
  }
  return updates
}
