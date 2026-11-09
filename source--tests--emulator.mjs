import assert from 'node:assert/strict'
import {test,after} from 'node:test'
import {createRequire} from 'node:module'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {getDoc,doc as webDoc,setDoc} from 'firebase/firestore'
import {ref,getBytes,uploadBytes} from 'firebase/storage'
import {randomUUID} from 'node:crypto'
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const {initializeApp}=require('firebase-admin/app')
const {getAuth}=require('firebase-admin/auth')
const {getFirestore}=require('firebase-admin/firestore')
const projectId='demo-cfl'
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST
assert.ok(authHost&&process.env.FIRESTORE_EMULATOR_HOST,'Use the local Firebase emulators.')
const testApp=initializeApp({projectId},'integration-tests')
const auth=getAuth(testApp), db=getFirestore(testApp)
const office=(kind,id)=>db.doc('cfl/v1/'+kind+'/'+id)
const command=promisify(execFile)
const rules=await initializeTestEnvironment({projectId,firestore:{rules:await readFile('firestore.rules','utf8')},storage:{rules:await readFile('storage.rules','utf8')}})
after(()=>rules.cleanup())
const unauth=rules.unauthenticatedContext()
let callableOrigin='http://127.0.0.1:5001'
if(process.env.CFL_DIRECT_HTTP==='1'){
  process.env.GCLOUD_PROJECT=projectId
  process.env.FUNCTIONS_EMULATOR='true'
  const routes=await import('../functions/index.mjs')
  const express=require('express')
  const app=express()
  app.use(express.json({limit:'8mb'}))
  for(const [name,handler] of Object.entries(routes)) app.all('/'+projectId+'/us-central1/'+name,handler)
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv))})
  callableOrigin='http://127.0.0.1:'+server.address().port
  after(()=>new Promise(resolve=>server.close(resolve)))
}
const pw='emulator-test-password'
async function user(name,email=name+'@example.test',emailVerified=true){
  await auth.createUser({uid:name,email,emailVerified,password:pw})
  const response=await fetch('http://'+authHost+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})
  })
  const payload=await response.json()
  assert.ok(payload.idToken,JSON.stringify(payload))
  return payload.idToken
}
async function request(name,token,data={}){
  const res=await fetch(callableOrigin+'/'+projectId+'/us-central1/cfl'+name,{
    method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({data})
  })
  const payload=await res.json()
  return payload.error?{error:payload.error.status,message:payload.error.message}:payload.result
}
const mutate=(token,action,data={})=>request('Mutate',token,{action,operation:randomUUID(),...data})
const assign=(token,email,role,scopes=[])=>mutate(token,'assign',{email,role,scopes})

test('Firebase integration: bootstrap, roles, rosters, races, official standings inputs and rollover',async()=>{
  const owner=await user('owner','levigrammer@gmail.com')
  const admin=await user('admin')
  const h=await user('home')
  const a=await user('away')
  const coach=await user('coach')
  const outsider=await user('outsider')
  const unverified=await user('unverified',undefined,false)
  const badBootstrap=command('node',['functions/setup-firebase.mjs','bootstrap',projectId,'wrong','--apply'])
  await assert.rejects(badBootstrap,/exact verified Auth UID/)
  const setup=async action=>(await command('node',['functions/setup-firebase.mjs',action,projectId,'owner','--apply'])).stdout
  assert.match(await setup('bootstrap'),/Verified active/)
  assert.match(await setup('bootstrap'),/Verified active/)
  assert.match(await setup('seed'),/source-backed records/)
  assert.match(await setup('seed'),/source-backed records/)
  assert.equal((await request('Dashboard',owner)).role.role,'superadmin')
  assert.equal((await request('Dashboard',unverified)).error,'PERMISSION_DENIED')
  assert.equal((await request('Dashboard',outsider)).role,null)
  assert.ok((await assign(owner,'admin@example.test','admin')).ok)
  assert.equal((await assign(admin,'outsider@example.test','admin')).error,'PERMISSION_DENIED')
  assert.equal((await mutate(owner,'revoke',{email:'levigrammer@gmail.com',reason:'Test'})).error,'PERMISSION_DENIED')
  assert.ok((await assign(admin,'home@example.test','director',['stroud'])).ok)
  assert.ok((await assign(admin,'away@example.test','director',['beggs'])).ok)
  assert.ok((await assign(admin,'coach@example.test','coach',['2026-12-stroud'])).ok)
  assert.equal((await assign(admin,'invite@example.test','coach',['2026-12-stroud'])).invited,true)
  const invited=await user('invite')
  assert.equal((await request('ClaimInvite',invited)).role,'coach')
  assert.equal((await request('ClaimInvite',outsider)).role,null)
  const pid='2026-12-stroud'
  assert.ok((await mutate(admin,'roster',{id:pid,players:[{name:'Test Player',jersey:'3',grade:2}]})).ok)
  assert.equal((await request('Dashboard',coach)).rosters[0].players[0].name,'Test Player')
  assert.equal((await request('Dashboard',a)).rosters.some(r=>r.id===pid),false)
  assert.equal((await mutate(a,'rosterExport',{id:pid})).error,'PERMISSION_DENIED')
  assert.equal((await mutate(coach,'roster',{id:pid,players:[]})).error,'PERMISSION_DENIED')
  assert.equal((await mutate(h,'save',{kind:'teams',record:{}})).error,'PERMISSION_DENIED')
  await assertFails(getDoc(webDoc(unauth.firestore(),'cfl/v1/rosters/'+pid)))
  await assertFails(getDoc(webDoc(rules.authenticatedContext('coach').firestore(),'cfl/v1/rosters/'+pid)))
  await assertFails(getDoc(webDoc(unauth.firestore(),'cfl/v1/roles/owner')))
  await assertFails(getDoc(webDoc(unauth.firestore(),'cfl/v1/audit/owner-bootstrap')))
  await assertSucceeds(getDoc(webDoc(unauth.firestore(),'cfl/v1/published/teams--'+pid)))
  await assertFails(setDoc(webDoc(unauth.firestore(),'cfl/v1/published/teams--'+pid),{published:true}))
  const g='emulator-test-game'
  const record={id:g,season:'2026',division:'2026-12',home:pid,away:'2026-12-beggs',venue:'stroud',field:'Main',kickoff:'2026-11-12T18:00',week:12,published:true}
  assert.ok((await mutate(admin,'save',{kind:'games',record})).ok)
  assert.equal((await mutate(admin,'save',{kind:'games',record:{...record,id:'duplicate'}})).error,'ALREADY_EXISTS')
  const input={id:g,scoreAction:'submit',expected:1,home:21,away:14,side:'home'}
  assert.equal((await mutate(a,'score',input)).error,'PERMISSION_DENIED')
  const races=await Promise.all([mutate(h,'score',input),mutate(h,'score',input)])
  assert.equal(races.filter(r=>r.ok).length,1,JSON.stringify(races))
  assert.equal(races.find(r=>r.error).error,'ABORTED')
  const publicRef=office('published','games--'+g)
  assert.equal((await publicRef.get()).data().official,undefined)
  assert.equal((await publicRef.get()).data().status,'scheduled')
  assert.equal((await mutate(h,'score',{id:g,scoreAction:'confirm',expected:2})).error,'PERMISSION_DENIED')
  assert.ok((await mutate(a,'score',{id:g,scoreAction:'dispute',expected:2,home:21,away:20,reason:'Check the book.'})).ok)
  assert.equal((await publicRef.get()).data().status,'scheduled')
  assert.ok((await mutate(admin,'score',{id:g,scoreAction:'override',expected:3,home:21,away:20,reason:'Checked the book.'})).ok)
  assert.equal((await publicRef.get()).data().official.away,20)
  assert.equal((await request('Audit',coach,{game:g})).error,'PERMISSION_DENIED')
  assert.equal((await request('Audit',a,{game:g})).entries.filter(e=>['submit','dispute','override'].includes(e.action)).length,3)
  const revision=(await office('games',g).get()).data().revision
  const correction={action:'score',operation:randomUUID(),id:g,scoreAction:'override',expected:revision,home:21,away:24,reason:'Verified corrected report.'}
  const first=await request('Mutate',admin,correction)
  assert.ok(first.ok)
  assert.deepEqual(await request('Mutate',admin,correction),first)
  assert.equal((await publicRef.get()).data().official.away,24)
  const nextGame={...record,id:'opposing-confirmation',kickoff:'2026-11-14T18:00'}
  assert.ok((await mutate(admin,'save',{kind:'games',record:nextGame})).ok)
  assert.ok((await mutate(h,'score',{...input,id:nextGame.id})).ok)
  assert.ok((await mutate(a,'score',{id:nextGame.id,scoreAction:'confirm',expected:2})).ok)
  assert.equal((await office('published','games--'+nextGame.id).get()).data().official.home,21)
  assert.ok((await mutate(h,'scheduleRequest',{id:g,details:'Please move kickoff.'})).ok)
  const change=(await request('Dashboard',admin)).requests[0]
  assert.ok((await mutate(admin,'requestDecision',{id:change.id,status:'approved',reason:'Venue confirmed.'})).ok)
  const document={name:'Test PDF',category:'Forms',published:true}
  const pdf=Buffer.from('%PDF-1.7\n% Synthetic emulator test only.').toString('base64')
  const upload={id:'test-document',operation:randomUUID(),record:document,mime:'application/pdf',base64:pdf}
  assert.equal((await request('Upload',coach,upload)).error,'PERMISSION_DENIED')
  assert.equal((await request('Upload',admin,{...upload,base64:'AAAA'})).error,'INVALID_ARGUMENT')
  assert.equal((await request('Upload',admin,upload)).id,upload.id)
  const attached=(await office('documents',upload.id).get()).data()
  const stored=ref(unauth.storage(),attached.storagePath)
  await assertFails(getBytes(stored))
  await assertFails(uploadBytes(stored,new Uint8Array([1,2,3])))
  const downloadUrl=callableOrigin+'/'+projectId+'/us-central1/cflDocument?id='+upload.id
  const downloaded=await fetch(downloadUrl)
  assert.equal(downloaded.status,200)
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString('base64'),pdf)
  assert.ok((await mutate(admin,'save',{kind:'documents',record:{...attached,published:false},version:attached.updatedAt})).ok)
  assert.equal((await fetch(downloadUrl)).status,404)
  const oldSeason=(await office('seasons','2026').get()).data()
  assert.ok((await mutate(admin,'save',{kind:'seasons',record:{...oldSeason,status:'archived'},version:oldSeason.updatedAt,reason:'Season rollover.'})).ok)
  assert.ok((await mutate(admin,'save',{kind:'seasons',record:{id:'2027',year:2027,name:'2027 Season',status:'active',published:true}})).ok)
  assert.equal((await publicRef.get()).data().official.away,24)
  assert.ok((await office('published','championships--2025-12').get()).exists)
  assert.ok((await mutate(admin,'revoke',{email:'coach@example.test',reason:'Season ended.'})).ok)
  assert.equal((await request('Dashboard',coach)).role,null)
  assert.equal((await mutate(coach,'rosterExport',{id:pid})).error,'PERMISSION_DENIED')
})
