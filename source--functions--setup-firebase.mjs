import {readFile} from 'node:fs/promises'
import {initializeApp} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'
import {KINDS} from './domain.mjs'
import {root,projectionID,publicRecord} from './projection.mjs'

const [action,project,uid,flag]=process.argv.slice(2)
const OWNER='levigrammer@gmail.com'
const emulator=project==='demo-cfl'
if(!['inspect','bootstrap','seed','verify'].includes(action)||!['pokemongridiron','demo-cfl'].includes(project)){
  throw new Error('Usage: node functions/setup-firebase.mjs <inspect|bootstrap|seed|verify> <pokemongridiron|demo-cfl> [verified-auth-uid] [--apply]')
}
if(emulator&&(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST))throw new Error('Set both emulator host variables before using demo-cfl.')
if(!emulator&&(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw new Error('Unset emulator host variables for the real Firebase project.')
initializeApp({projectId:project})
const db=getFirestore()
const league=root(db)
const col=kind=>league.collection(kind)
const profile=()=>getAuth().getUserByEmail(OWNER)

if(action==='inspect'){
  const top=await db.listCollections()
  const children=await league.listCollections()
  console.log(JSON.stringify({project,topLevel:top.map(c=>c.id),cflNamespace:children.map(c=>c.id)},null,2))
  process.exit(0)
}
const user=await profile()
if(!user.emailVerified || user.disabled || user.email?.toLowerCase()!==OWNER || !user.providerData.some(p=>['google.com','password'].includes(p.providerId)))throw new Error('The expected owner needs an enabled, verified Google or password account.')
if(uid!==user.uid)throw new Error('Pass the exact verified Auth UID shown in the Firebase Authentication console.')
const owner=col('roles').doc(uid)
const lock=col('system').doc('owner-bootstrap')
if(action==='bootstrap'){
  if(flag!=='--apply')throw new Error('Repeat this command with --apply after reviewing the Firebase project and owner UID.')
  await db.runTransaction(async tx=>{
    const [state,current]=await tx.getAll(lock,owner)
    if(state.exists){
      if(state.data().uid!==uid||current.data()?.role!=='superadmin'||current.data()?.active!==true)throw new Error('Bootstrap marker differs from the active owner. Investigate using operator access.')
      return
    }
    if(current.exists || !(await tx.get(col('roles').where('role','==','superadmin').limit(1))).empty)throw new Error('An owner assignment already exists. Inspect it before proceeding.')
    const at=new Date().toISOString()
    const record={id:uid,email:OWNER,role:'superadmin',scopes:[],active:true,updatedAt:at,updatedBy:uid}
    tx.create(owner,record);tx.create(lock,{uid,at})
    tx.create(col('audit').doc('owner-bootstrap'),{id:'owner-bootstrap',uid,actor:OWNER,role:'superadmin',action:'owner bootstrap',kind:'roles',key:uid,before:null,after:record,reason:'Verified owner UID and privileged operator credentials',at})
  })
}
const [marker,role]=await Promise.all([lock.get(),owner.get()])
if(marker.data()?.uid!==uid || role.data()?.role!=='superadmin' || !role.data()?.active || role.data()?.email!==OWNER)throw new Error('The owner bootstrap has not been verified.')
console.log('Verified active CFL Super Admin for project '+project+'.')
if(action==='seed'){
  if(flag!=='--apply')throw new Error('Repeat this command with --apply after reviewing the public import.')
  const data=JSON.parse(await readFile(new URL('../fixtures/legacy.json',import.meta.url),'utf8'))
  const records=KINDS.flatMap(kind=>(data[kind]??[]).map(row=>({kind,row})))
  const migration=col('system').doc('legacy-2026-v1')
  const at=new Date().toISOString()
  const initial=await db.runTransaction(async tx=>{
    const state=(await tx.get(migration)).data()
    if(state)return state
    const existing=await Promise.all(KINDS.map(k=>tx.get(col(k).limit(1))))
    if(existing.some(s=>!s.empty))throw new Error('CFL already has data. Compare the import against existing records before merging.')
    const start={status:'in_progress',offset:0,at}
    tx.create(migration,start)
    return start
  })
  let offset=initial.offset
  while(offset<records.length){
    offset=await db.runTransaction(async tx=>{
      const state=(await tx.get(migration)).data()
      const start=state.offset
      const batch=records.slice(start,start+150)
      if(!batch.length)return start
      const refs=batch.map(({kind,row})=>col(kind).doc(row.id))
      const publicRefs=batch.map(({kind,row})=>col('published').doc(projectionID(kind,row.id)))
      const existing=await tx.getAll(...refs,...publicRefs)
      if(existing.some(r=>r.exists))throw new Error('The CFL namespace changed during the import. Stop and review the conflicting documents.')
      batch.forEach(({kind,row},i)=>{
        const doc={...row,createdAt:at,updatedAt:at,updatedBy:uid}
        tx.create(refs[i],doc)
        const publicRow=publicRecord(kind,doc,data)
        if(publicRow)tx.create(publicRefs[i],publicRow)
      })
      const next=start+batch.length, done=next===records.length
      tx.update(migration,{offset:next,status:done?'complete':'in_progress'})
      if(done)tx.create(col('audit').doc('legacy-2026-v1'),{id:'legacy-2026-v1',uid,actor:OWNER,role:'superadmin',action:'legacy records imported',kind:'migration',key:'legacy-2026-v1',before:null,after:{records:next},reason:'Published legacy CFL schedule, scores and history',at})
      return next
    })
  }
  console.log('Verified '+offset+' source-backed records in the migration receipt.')
}
