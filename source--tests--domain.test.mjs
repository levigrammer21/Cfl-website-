import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {standings,changeScore,bracketUpdates,canSeeRoster,checkSchedule,chicagoTime} from '../functions/domain.mjs'
import {normalize} from '../functions/schema.mjs'
import {publicRecord} from '../functions/projection.mjs'
const teams=[{id:'h',town:'north',name:'North',conference:'North'},{id:'a',town:'south',name:'South',conference:'South'},{id:'n',town:'north2',name:'North 2',conference:'North'}]
const director=(...scopes)=>({role:'director',scopes})
const admin={role:'admin'}
const game={id:'g',home:'h',away:'a',type:'regular',status:'scheduled',revision:0}
const run=(args)=>changeScore({game,teams,actor:'h-dir',role:director('north'),action:'submit',home:20,away:14,reason:'',side:'home',expected:0,...args})
test('only assigned directors report a score and only the opposing director confirms',()=>{
  assert.throws(()=>run({role:director('wrong')}),/assigned towns/)
  const pending=run()
  assert.equal(pending.status,'pending')
  assert.equal(pending.official,undefined)
  assert.throws(()=>run({game:pending,expected:1,action:'confirm',role:director('north','south')}),/opposing director/)
  assert.throws(()=>run({game:pending,expected:1,action:'confirm',role:director('south')}),/opposing director/)
  const final=run({game:pending,expected:1,action:'confirm',role:director('south'),actor:'a-dir'})
  assert.deepEqual(final.official,{home:20,away:14,overtime:false})
  assert.throws(()=>run({game:final,expected:1,action:'confirm',role:director('south'),actor:'a-dir'}),/game changed/i)
})
test('disputes preserve the proposal and only a reasoned admin override makes it official',()=>{
  const pending=run()
  const disputed=run({game:pending,expected:1,action:'dispute',role:director('south'),actor:'a-dir',reason:'Incorrect away score',away:21})
  assert.equal(disputed.proposal.away,14)
  assert.equal(disputed.dispute.away,21)
  assert.equal(disputed.official,undefined)
  assert.throws(()=>run({game:disputed,expected:2,action:'override'}),/administrators/)
  assert.throws(()=>run({game:disputed,expected:2,action:'override',role:admin}),/explanation/)
  const final=run({game:disputed,expected:2,action:'override',role:admin,reason:'Verified book',away:21})
  assert.equal(final.official.away,21)
})
test('cross-conference scores count overall but not in conference records or points',()=>{
  const game1={...game,status:'final',official:{home:20,away:14}}
  const game2={...game,id:'g2',away:'n',status:'final',official:{home:36,away:0,overtime:true}}
  const games=[game1,game2,{...game1,id:'g3',status:'forfeited'}]
  const [r]=standings([teams[0],teams[2]],games,{allTeams:teams,breakers:['conference','conferencePoints'],pointCap:8,overtimePoints:1,forfeitPolicy:'exclude'})
  assert.equal(r.w,2)
  assert.equal(r.cw,1)
  assert.equal(r.cp,1)
  assert.equal(r.pf,56)
})
test('unconfigured seeding leaves rankings unset and unresolved ties share a rank',()=>{
  assert.equal(standings(teams,[])[0].rank,null)
  const final={...game,status:'final',official:{home:7,away:7}}
  assert.deepEqual(standings(teams.slice(0,2),[final],{breakers:['record','head']}).map(r=>r.rank),[1,1])
})
test('roster access is scoped and never available to public visitors',()=>{
  assert.equal(canSeeRoster(null,teams[0]),false)
  assert.equal(canSeeRoster(director('south'),teams[0]),false)
  assert.equal(canSeeRoster({role:'coach',scopes:['a']},teams[0]),false)
  assert.equal(canSeeRoster({role:'coach',scopes:['h']},teams[0]),true)
  assert.equal(canSeeRoster(admin,teams[1]),true)
})
test('concurrent candidates overlap only when scheduled into the same team or field',()=>{
  const scheduled={...game,kickoff:'2026-09-12T19:00:00Z',duration:90,venue:'field',field:'One'}
  assert.throws(()=>checkSchedule({...scheduled,id:'b',home:'z',away:'n'},[scheduled]),/field is booked/)
  assert.throws(()=>checkSchedule({...scheduled,id:'b',venue:'other',home:'h',away:'n'},[scheduled]),/team already plays/)
  checkSchedule({...scheduled,id:'b',kickoff:'2026-09-12T20:30:00Z'},[scheduled])
  assert.throws(()=>chicagoTime('2026-11-01T01:30'),/daylight-saving/)
  assert.equal(chicagoTime('2026-09-12T14:00'),'2026-09-12T19:00:00.000Z')
})
test('bracket corrections advance winners and cannot invalidate a downstream score',()=>{
  const q={...game,bracket:'b',round:1,type:'playoff',status:'final',official:{home:7,away:0}}
  const f={...game,id:'f',home:'h',away:'n',homeFrom:'g',bracket:'b',round:2,type:'championship'}
  const correction={...q,official:{home:0,away:7}}
  assert.equal(bracketUpdates([q,f],correction)[0].home,'a')
  assert.throws(()=>bracketUpdates([q,{...f,official:{home:7,away:0}}],correction),/downstream result/)
  const bye={...q,home:'a',away:'',bye:true,status:'scheduled',official:null}
  assert.equal(bracketUpdates([bye,f],bye)[0].home,'a')
  const reset=run({game:q,action:'reset',role:admin,reason:'Incorrect final'})
  assert.equal(reset.official,null)
  assert.equal(bracketUpdates([q,f],reset)[0].home,'')
})
test('draft seasons stay private, archives remain archived and pending scores do not leak',()=>{
  const db={seasons:[{id:'2026',year:2026,status:'active',published:true},{id:'2025',year:2025,status:'archived',published:true}],games:[]}
  assert.throws(()=>normalize('seasons',{id:'2025',name:'2025',year:2025,status:'active'},db,db.seasons[1]),/stay archived/)
  assert.throws(()=>normalize('seasons',{id:'2027',name:'2027',year:2027,status:'draft',published:true},db),/remain private/)
  assert.equal(normalize('seasons',{id:'2027',name:'2027',year:2027,status:'draft'},db).status,'draft')
  const pending={...run(),season:'2026',published:true}
  const p=publicRecord('games',pending,db)
  assert.equal(p.status,'scheduled')
  assert.equal(p.proposal,undefined)
  assert.equal(publicRecord('rosters',{id:'a',published:true},db),null)
})
test('legacy results and schedules contain unique stable IDs and traceable source data',()=>{
  const data=JSON.parse(readFileSync(new URL('../fixtures/legacy.json',import.meta.url)))
  for(const rows of Object.values(data)) assert.equal(new Set(rows.map(x=>x.id)).size,rows.length)
  assert.equal(data.games.filter(g=>g.official).length,136)
  assert.equal(data.events.length,48)
  const week2=data.games.find(g=>g.id==='2026-w2-stroud-inola-12')
  assert.deepEqual(week2.official,{home:20,away:13,overtime:false})
  assert.equal(data.championships.find(c=>c.id==='2022-56').verification,'unknown')
})
