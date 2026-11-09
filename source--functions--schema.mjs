import {BREAKERS, KINDS, checkSchedule, chicagoTime, localDay, requireValue as need} from './domain.mjs'

export const id = v => { need(typeof v==='string' && /^[a-zA-Z0-9_-]{1,130}$/.test(v),'Invalid record ID.'); return v }
export const text = (v,max=200) => { need(typeof (v??'')==='string' && (v??'').length<=max,'Text is too long or invalid.'); return (v??'').trim() }
export const required = (v,max) => { const result=text(v,max); need(result,'A required field is missing.'); return result }
export const number = (v,min,max) => { need(Number.isInteger(v)&&v>=min&&v<=max,`Enter a whole number between ${min} and ${max}.`); return v }
export const choice = (v,values) => { need(values.includes(v),'Choose a valid option.'); return v }
export const day = (v,optional=true) => {
  if (!v && optional) return ''
  need(typeof v==='string' && /^\d{4}-\d\d-\d\d$/.test(v),'Enter a valid date.')
  const date=new Date(v+'T12:00:00Z')
  need(Number.isFinite(+date) && date.toISOString().slice(0,10)===v,'Enter a valid date.')
  return v
}
export const url = v => {
  const result=text(v,1500)
  if (!result) return ''
  let parsed
  try { parsed=new URL(result) } catch { need(false,'Enter a complete HTTPS URL.') }
  need(parsed.protocol==='https:' && !parsed.username && !parsed.password,'Enter a complete HTTPS URL.')
  return parsed.href
}
export const strings = (v,max=16) => {
  need(Array.isArray(v??[]) && (v??[]).length<=max,'Too many options.')
  return [...new Set((v??[]).map(x=>required(x,70)))]
}
const boolean = v => v===true
const color = v => { const c=text(v,7); need(!c || /^#[0-9a-f]{6}$/i.test(c),'Enter a six-digit hex color.'); return c }
const shape=(v,fields)=>Object.fromEntries(Object.entries(fields).map(([k,fn])=>[k,fn(v[k])]))
const words=v=>text(v,180)
const notes=v=>text(v,3500)
const name=v=>required(v,110)
const n=(min,max,def)=>v=>number(v??def,min,max)
const c=(values,def)=>v=>choice(v??def,values)
const optionalID=v=>v?id(v):''
const status=c(['scheduled','in_progress','postponed','canceled'],'scheduled')

export function normalize(kind,raw,db,old) {
  need(KINDS.includes(kind) && raw && typeof raw==='object' && !Array.isArray(raw),'Invalid record.')
  const lookup=(collection,key,optional=false)=>{
    if (!key && optional) return null
    const result=db[collection]?.find(row=>row.id===id(key))
    need(result,`Choose an existing ${collection} record.`,'failed-precondition')
    return result
  }
  const schemas={
    seasons:{name,year:n(1900,2200),status:c(['draft','active','archived'],'draft'),start:day,end:day,conferences:strings,scheduleMode:c(['town','independent','both'],'both'),breakers:v=>strings(v,10).map(k=>choice(k,Object.keys(BREAKERS))),pointCap:n(0,999,8),overtimePoints:n(0,999,1),forfeitPolicy:c(['unconfigured','exclude','score'],'unconfigured'),rulesUrl:url,notes,showPending:boolean},
    towns:{name,mascot:words,color,logo:url,contact:words,contactUrl:url,active:v=>v!==false},
    venues:{name,town:optionalID,address:v=>required(v,300),field:words,parking:notes,entrance:notes,directions:url},
    divisions:{name,season:id,order:n(1,100,1),breakers:v=>strings(v,10).map(k=>choice(k,Object.keys(BREAKERS))),notes},
    teams:{name,season:id,town:id,division:id,conference:words,coach:words,active:v=>v!==false},
    events:{name,season:id,week:n(1,100),day:v=>day(v,false),homeTown:id,awayTown:id,venue:optionalID,notes},
    games:{season:id,division:id,week:n(1,100),day,kickoff:v=>v?chicagoTime(v):'',duration:n(15,720,90),venue:optionalID,field:words,home:optionalID,away:optionalID,event:optionalID,type:c(['regular','playoff','championship'],'regular'),status,notes,bracket:optionalID,round:n(1,20,1),bye:boolean,homeSeed:words,awaySeed:words,homeFrom:optionalID,awayFrom:optionalID},
    brackets:{name,season:id,division:id,qualifiers:n(2,64,8),locked:boolean,notes},
    championships:{season:id,division:id,winnerTown:optionalID,winnerName:words,runnerUp:words,game:optionalID,verification:c(['verified','review','unknown'],'review'),notes},
    announcements:{name,body:v=>required(v,5000),season:optionalID,day,url},
    documents:{name,category:v=>required(v,60),url,notes,storagePath:v=>text(v,230)}
  }
  let row={id:id(raw.id),...shape(raw,schemas[kind]),published:boolean(raw.published),source:url(raw.source)}
  const season=row.season?lookup('seasons',row.season):null
  const division=row.division?lookup('divisions',row.division):null
  if (division) need(division.season===row.season,'Choose a division in this season.')
  if (kind==='seasons') {
    need(!row.start || !row.end || row.start<=row.end,'Season end must follow its start.')
    need(row.status!=='draft' || !row.published,'Draft seasons must remain private.')
    need(!db.seasons.some(r=>r.id!==row.id && r.year===row.year),'A season for that year already exists.')
    need(!(old?.status==='archived' && row.status!=='archived'),'Archived seasons stay archived.')
    need(row.status!=='active' || !db.seasons.some(s=>s.id!==row.id && s.status==='active'),'Archive the active season before activating another.')
  }
  if (kind==='teams') {
    const town=lookup('towns',row.town)
    row.townName=old?.town===row.town && old.townName ? old.townName : town.name
    need(!row.conference || season.conferences?.includes(row.conference),'Use a conference configured for the season.')
    need(!old || (old.town===row.town && old.division===row.division && old.season===row.season) || !db.games.some(g=>g.home===row.id || g.away===row.id),'Teams with games must keep their town, division and season.')
  }
  if (kind==='venues' && row.town) lookup('towns',row.town)
  if (kind==='events') {
    need(row.homeTown!==row.awayTown,'Choose two different towns.')
    lookup('towns',row.homeTown); lookup('towns',row.awayTown); lookup('venues',row.venue,true)
  }
  if (kind==='games') {
    const {home,away,type,kickoff}=row
    const bracket=lookup('brackets',row.bracket,true)
    const event=lookup('events',row.event,true)
    lookup('venues',row.venue,true)
    need(type!=='regular' || (home && away && !bracket && !row.homeFrom && !row.awayFrom),'Regular games need two teams and cannot be in a playoff bracket.')
    need(!row.bye || (type==='playoff' && bracket && !kickoff && !!(home||row.homeFrom)!==!!(away||row.awayFrom)),'A bracket bye needs one team or feeder, with no kickoff.')
    need(!home || home!==away,'Choose two different teams.')
    const legacyKickoff=old?.kickoff && !old.field && Date.parse(old.kickoff)===Date.parse(kickoff) && old.venue===row.venue
    need(!kickoff || row.venue && (row.field || legacyKickoff),'Enter a venue and field for a scheduled kickoff.')
    if (kickoff) {
      const d=localDay(new Date(kickoff))
      need(!row.day || row.day===d,'The date must match the Central Time kickoff.')
      row.day=d
    }
    need(!row.published || row.day,'Published games need a date.')
    for (const side of ['home','away']) {
      const team=lookup('teams',row[side],true)
      const feeder=lookup('games',row[side+'From'],true)
      need(!team || team.division===row.division,'Both teams must be in this division.')
      need(!feeder || (bracket && feeder.bracket===bracket.id && feeder.id!==row.id && feeder.round<row.round),'A feeder must be in an earlier round of this bracket.')
      need(!event || !team || team.town===event[side+'Town'],'Teams must match the town event.')
    }
    need(!bracket || bracket.division===row.division,'The bracket must match the game division.')
    need(!row.homeFrom || row.homeFrom!==row.awayFrom,'Choose different feeder games.')
    need(!event || event.season===row.season && event.week===row.week && event.day===row.day,'The event must match the game’s season, week and date.')
    if (old?.official || old?.proposal || old?.dispute) {
      need(['home','away','type','division','season','bracket','round','homeFrom','awayFrom'].every(k=>(old[k]??'')===(row[k]??'' ) || (k==='round' && old[k]===undefined && row[k]===1)),'Resolve the recorded result before changing teams or competition.')
      need(!['postponed','canceled'].includes(row.status),'A scored or reported game requires a score resolution.')
      row={...row,status:old.status,official:old.official??null,proposal:old.proposal??null,dispute:old.dispute??null}
    }
    row.revision=(old?.revision??0)+1
    checkSchedule(row,db.games)
  }
  if (kind==='championships') {
    if (row.winnerTown) lookup('towns',row.winnerTown)
    if (row.game) need(lookup('games',row.game).division===row.division,'The game must match the division.')
    need(row.verification!=='verified' || ((row.source || row.game) && (row.winnerTown || row.winnerName)),'Verified entries require a source and a winner.')
  }
  if (kind==='documents') {
    need(row.url || row.storagePath,'Enter an HTTPS link or upload a document.')
    need(!row.storagePath || row.storagePath===old?.storagePath,'Upload files through the document upload control.')
  }
  return row
}
