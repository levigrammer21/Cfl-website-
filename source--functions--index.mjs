import {randomUUID,createHash} from 'node:crypto'
import {initializeApp} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'
import {getStorage} from 'firebase-admin/storage'
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https'
import {logger} from 'firebase-functions'
import {KINDS,canSeeRoster,isAdmin,sides,changeScore,bracketUpdates,requireValue as need,hasScore} from './domain.mjs'
import {normalize,id,text,required,choice,number,url} from './schema.mjs'
import {root,projectionID,publicRecord} from './projection.mjs'

initializeApp()
const db=getFirestore()
const league=root(db)
const col=kind=>league.collection(kind)
const audit=col('audit')
const doc=(kind,key)=>col(kind).doc(id(key))
const now=()=>new Date().toISOString()
const hash=value=>createHash('sha256').update(value).digest('hex')
const ALLOW_INVITE=['admin','director','coach']
const mail=v=>{const e=required(v,254).toLowerCase(); need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),'Enter a valid email address.');return e}
const verifiedAuth=req=>req.auth?.token?.email_verified===true && req.auth?.token?.firebase?.sign_in_provider!=='anonymous' && req.auth.token.email
const authorize=(ok,message='Your assignment does not grant this access.')=>need(ok,message,'permission-denied')
const queryPage=async(collection,limit=300)=>{
  const result=[]
  let cursor
  do {
    const q=collection.orderBy('__name__').limit(limit)
    const page=await (cursor?q.startAfter(cursor):q).get()
    result.push(...page.docs.map(x=>x.data()))
    cursor=page.size===limit?page.docs.at(-1):null
  } while(cursor)
  return result
}
const fetchRecords=async reader=>Object.fromEntries(await Promise.all(KINDS.map(async kind=>[
  kind,reader?(await reader.get(col(kind))).docs.map(d=>d.data()):await queryPage(col(kind))
])))
const roleFor=async (uid,reader)=> {
  const ref=doc('roles',uid)
  const row=(reader?await reader.get(ref):await ref.get()).data()
  return row?.active?row:null
}
const isProtected=role=>role?.role==='superadmin'
const manageRole=(actor,target)=>actor?.role==='superadmin' || (actor?.role==='admin' && ['director','coach'].includes(target))
const summary=row=>row ? {status:row.status,official:row.official??null,proposal:row.proposal??null,dispute:row.dispute??null,revision:row.revision??0} : null
const getUser=async email=>{try{return await getAuth().getUserByEmail(email)}catch(e){if(e.code==='auth/user-not-found')return null;throw e}}
const envelope=fn=>onCall({region:'us-central1',maxInstances:10,timeoutSeconds:60},async req=>{
  try{
    const email=verifiedAuth(req)
    authorize(email,'Sign in with a verified Google or email account.')
    return await fn(req.data??{},req.auth.uid,String(email).toLowerCase())
  }catch(e){
    if(e instanceof HttpsError) throw e
    if(['invalid-argument','permission-denied','not-found','failed-precondition','aborted','already-exists','resource-exhausted'].includes(e.code)) throw new HttpsError(e.code,e.message)
    logger.error('CFL operation failed',{code:e.code,message:e.message})
    throw new HttpsError('internal','The league service could not complete that request. Please try again.')
  }
})

function log(tx,uid,role,action,kind,key,before,after,reason='',extra={}) {
  const entry={id:randomUUID(),uid,actor:role.email,role:role.role,action,kind,key,before:before??null,after:after??null,reason,at:now(),...extra}
  tx.create(audit.doc(entry.id),entry)
}

function updateProjection(tx,kind,row,records) {
  const p=publicRecord(kind,row,records)
  const ref=col('published').doc(projectionID(kind,row.id))
  if (p) tx.set(ref,p)
  else tx.delete(ref)
}
function storeRecord(tx,kind,row,records,uid) {
  const before=records[kind].find(x=>x.id===row.id)
  const entry={...row,updatedAt:now(),createdAt:before?.createdAt??now(),updatedBy:uid}
  records[kind]=[...records[kind].filter(x=>x.id!==row.id),entry]
  tx.set(doc(kind,row.id),entry)
  updateProjection(tx,kind,entry,records)
}
function archived(records,season,role,reason) {
  if (records.seasons.find(s=>s.id===season)?.status==='archived') {
    authorize(isAdmin(role),'Archived seasons are read-only for your role.')
    need(reason,'Explain this correction to the archived season.')
  }
}
function requiredRevision(data,old) {
  need((data.version??'')===(old?.updatedAt??''),'This record was updated. Refresh and try again.','aborted')
}

export const cflClaimInvite=envelope(async (_data,uid,email)=>{
  return db.runTransaction(async tx=>{
    const existing=await roleFor(uid,tx)
    if(existing) return {role:existing.role}
    const inviteRef=col('invites').doc(hash(email))
    const invite=(await tx.get(inviteRef)).data()
    if(!invite?.active) return {role:null}
    const saved=(await tx.get(doc('roles',uid))).data()
    authorize(!isProtected(saved))
    const role={id:uid,email,role:invite.role,scopes:invite.scopes,active:true,updatedAt:now(),updatedBy:invite.updatedBy}
    tx.set(doc('roles',uid),role)
    tx.set(inviteRef,{active:false,claimedBy:uid,claimedAt:now()},{merge:true})
    log(tx,uid,role,'invite accepted','roles',uid,null,role)
    return {role:role.role}
  })
})

export const cflDashboard=envelope(async (_data,uid,email)=>{
  const role=await roleFor(uid)
  if(!role || role.email!==email) return {role:null}
  const records=await fetchRecords()
  const admin=isAdmin(role)
  const canGame=g=>admin||sides(role,g,records.teams).length>0
  const canTeam=t=>canSeeRoster(role,t)
  const teams=records.teams.filter(canTeam)
  const games=role.role==='coach'?[]:records.games.filter(canGame)
  const rosters=await Promise.all(teams.map(async team=>(await doc('rosters',team.id).get()).data()??{id:team.id,players:[]}))
  const requests=role.role==='coach'?[]:admin?await queryPage(col('requests')):await queryPage(col('requests').where('uid','==',uid))
  const [roles,invites]=admin?await Promise.all([queryPage(col('roles')),queryPage(col('invites'))]):[[],[]]
  const finalRole=await roleFor(uid)
  authorize(finalRole && JSON.stringify([finalRole.role,finalRole.scopes])===JSON.stringify([role.role,role.scopes]),'Your access changed. Sign in again.')
  const relatedTeams=records.teams.filter(t=>canTeam(t)||games.some(g=>g.home===t.id||g.away===t.id))
  const relatedSeasons=new Set(relatedTeams.map(t=>t.season))
  const relatedDivisions=new Set(relatedTeams.map(t=>t.division))
  const relatedTowns=new Set(relatedTeams.map(t=>t.town))
  const scopedRecords={
    seasons:records.seasons.filter(s=>relatedSeasons.has(s.id)),
    teams:relatedTeams,
    divisions:records.divisions.filter(d=>relatedDivisions.has(d.id)),
    towns:records.towns.filter(t=>relatedTowns.has(t.id)||(role.role==='director'&&role.scopes.includes(t.id))),
    venues:records.venues.filter(v=>games.some(g=>g.venue===v.id))
  }
  return {role,records:admin?records:scopedRecords,games,rosters,requests,roles,invites:invites.filter(r=>r.active)}
})

export const cflAudit=envelope(async ({game,cursor},uid,email)=>{
  const role=await roleFor(uid)
  authorize(role?.email===email && role.role!=='coach')
  let query=audit
  if(game) {
    const g=(await doc('games',game).get()).data()
    need(g,'Game not found.','not-found')
    const teams=await queryPage(col('teams'))
    authorize(isAdmin(role)||sides(role,g,teams).length>0)
    query=query.where('kind','==','games').where('key','==',id(game))
  } else authorize(isAdmin(role))
  query=query.orderBy('at','desc').orderBy('__name__','desc').limit(40)
  if(cursor) query=query.startAfter(text(cursor.at,40),id(cursor.id))
  const list=(await query.get()).docs.map(d=>d.data())
  const finalRole=await roleFor(uid)
  authorize(finalRole && JSON.stringify([finalRole.role,finalRole.scopes])===JSON.stringify([role.role,role.scopes]),'Your access changed. Sign in again.')
  return {entries:list,cursor:list.length===40?{at:list.at(-1).at,id:list.at(-1).id}:null}
})

export const cflLookupUser=envelope(async (data,uid,email)=>{
  const role=await roleFor(uid)
  authorize(isAdmin(role)&&role.email===email)
  const user=await getUser(mail(data.email))
  return {exists:!!user,verified:!!user?.emailVerified,disabled:!!user?.disabled}
})

const documentBucket=()=>getStorage().bucket(process.env.CFL_STORAGE_BUCKET || (process.env.FUNCTIONS_EMULATOR==='true'?'demo-cfl.appspot.com':'pokemongridiron.firebasestorage.app'))

export const cflDocument=onRequest({region:'us-central1',cors:true,maxInstances:5,timeoutSeconds:30},async (req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.status(405).set('Allow','GET, HEAD').end();return}
  const key=req.query.id
  if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,130}$/.test(key)){res.status(404).end();return}
  try{
    const record=(await col('published').doc(projectionID('documents',key)).get()).data()
    const path=record?.storagePath
    if(!path){res.status(404).end();return}
    const ext=path.split('.').at(-1)
    const mime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg'}[ext]
    if(!mime || !path.startsWith('cfl/v1/documents/'+projectionID('documents',key)+'/')){res.status(404).end();return}
    const [content]=await documentBucket().file(path).download()
    res.status(200).set({
      'Content-Type':mime,
      'Content-Disposition':'attachment; filename="CFL-'+key+'.'+ext+'"',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    }).send(content)
  }catch(e){
    logger.error('CFL document retrieval failed',{code:e.code})
    res.status(Number(e.code)===404?404:503).end()
  }
})

const attachFiles = {
  'application/pdf':{ext:'pdf',test:b=>b.subarray(0,5).toString()==='%PDF-'},
  'image/png':{ext:'png',test:b=>b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'},
  'image/jpeg':{ext:'jpg',test:b=>b.subarray(0,3).toString('hex')==='ffd8ff'}
}
export const cflUpload=envelope(async (data,uid,email)=>{
  const role=await roleFor(uid)
  authorize(isAdmin(role)&&role.email===email)
  const key=id(data.id)
  const type=attachFiles[data.mime]
  const reason=text(data.reason,700)
  need(type && typeof data.base64==='string' && data.base64.length<=6990512,'Upload a PDF, PNG or JPEG up to 5 MB.')
  const content=Buffer.from(data.base64,'base64')
  need(content.length>0 && content.length<=5242880 && type.test(content),'The file does not match its declared type.')
  const operation=id(data.operation)
  const storagePath='cfl/v1/documents/'+projectionID('documents',key)+'/'+operation+'.'+type.ext
  const file=documentBucket().file(storagePath)
  const receipt=col('receipts').doc(hash(uid+operation))
  const prior=await db.runTransaction(async tx=>{
    const fresh=await roleFor(uid,tx)
    authorize(isAdmin(fresh)&&fresh.email===email)
    const found=(await tx.get(receipt)).data()
    if(found) return found.result
    const rateRef=col('rates').doc(uid)
    const rate=(await tx.get(rateRef)).data()
    const window=Math.floor(Date.now()/60000)
    const hits=rate?.window===window?rate.hits:0
    need(hits<35,'Too many changes in one minute. Try again shortly.','resource-exhausted')
    const old=(await tx.get(doc('documents',key))).data()
    requiredRevision(data,old)
    normalize('documents',{...data.record,id:key,storagePath},{},{...old,storagePath})
    tx.set(rateRef,{window,hits:hits+1})
    return null
  })
  if(prior) return prior
  try {
    await file.save(content,{resumable:false,contentType:data.mime,preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, max-age=0'}})
  } catch(e) {
    if(Number(e.code)!==412) throw e
    const [metadata]=await file.getMetadata()
    need(metadata.md5Hash===createHash('md5').update(content).digest('base64'),'Retry this upload with a fresh operation ID.','aborted')
  }
  return db.runTransaction(async tx=>{
    const fresh=await roleFor(uid,tx)
    authorize(isAdmin(fresh)&&fresh.email===email)
    const found=(await tx.get(receipt)).data()
    if(found) return found.result
    const records=await fetchRecords(tx)
    const old=records.documents.find(x=>x.id===key)
    requiredRevision(data,old)
    const row=normalize('documents',{...data.record,id:key,storagePath},records,{...old,storagePath})
    storeRecord(tx,'documents',row,records,uid)
    log(tx,uid,{...fresh,email},'document upload','documents',key,old,row,reason)
    const result={id:key}
    tx.create(receipt,{result,at:now()})
    return result
  })
})

export const cflMutate=envelope(async (data,uid,email)=>{
  const op=id(data.operation)
  const action=required(data.action,40)
  const reason=text(data.reason,700)
  authorize((await roleFor(uid))?.email===email)
  const emailTarget=['assign','revoke'].includes(action)?mail(data.email):''
  const targetUser=emailTarget?await getUser(emailTarget):null
  const receipt=col('receipts').doc(hash(uid+op))
  return db.runTransaction(async tx=>{
    const role=await roleFor(uid,tx)
    authorize(role?.email===email)
    const actor={...role,email}
    const prior=(await tx.get(receipt)).data()
    if(prior) return prior.result
    const rateRef=col('rates').doc(uid)
    const rate=(await tx.get(rateRef)).data()
    const window=Math.floor(Date.now()/60000)
    const hits=rate?.window===window?rate.hits:0
    need(hits<35,'Too many changes in one minute. Try again shortly.','resource-exhausted')
    const records=await fetchRecords(tx)
    let result={ok:true}

    if(['assign','revoke'].includes(action)){
      authorize(isAdmin(role))
      const targetRef=targetUser?doc('roles',targetUser.uid):null
      const target=targetRef?(await tx.get(targetRef)).data():null
      const inviteRef=col('invites').doc(hash(emailTarget))
      const invite=(await tx.get(inviteRef)).data()
      authorize(!isProtected(target),'The bootstrapped Super Admin is protected.')
      if(target) authorize(manageRole(role,target.role))
      if(invite?.active) authorize(manageRole(role,invite.role))
      if(action==='revoke') {
        need(target?.active || invite?.active,'No active assignment was found.','not-found')
        need(reason,'Enter a reason for revoking access.')
        if(target) tx.set(targetRef,{active:false,updatedBy:uid,updatedAt:now()},{merge:true})
        if(invite) tx.set(inviteRef,{active:false,updatedBy:uid,updatedAt:now()},{merge:true})
        log(tx,uid,actor,'access revoked','roles',targetUser?.uid??hash(emailTarget),target??invite,{email:emailTarget,active:false},reason)
      }else{
        const wanted=choice(data.role,ALLOW_INVITE)
        authorize(manageRole(role,wanted))
        const collection=wanted==='director'?'towns':'teams'
        const allowed=data.scopes??[]
        need(Array.isArray(allowed)&&allowed.length<=50,'Choose up to 50 scopes.')
        const scopes=wanted==='admin'?[]:[...new Set(allowed.map(id))]
        need(wanted==='admin'||scopes.length && scopes.every(s=>records[collection].some(r=>r.id===s)),'Choose existing towns or teams for this role.')
        const assignment={email:emailTarget,role:wanted,scopes,active:true,updatedBy:uid,updatedAt:now()}
        const active=targetUser?.emailVerified && !targetUser.disabled
        need(!targetUser?.disabled,'Enable the Firebase Auth account before assigning access.')
        if(active){
          tx.set(targetRef,{id:targetUser.uid,...assignment})
          if(invite) tx.set(inviteRef,{active:false,updatedAt:now()},{merge:true})
        }else{
          if(target?.active) tx.set(targetRef,{active:false,updatedBy:uid,updatedAt:now()},{merge:true})
          tx.set(inviteRef,{id:hash(emailTarget),...assignment})
        }
        log(tx,uid,actor,active?'access assigned':'invitation recorded','roles',active?targetUser.uid:hash(emailTarget),target??invite,assignment,reason)
        result={ok:true,invited:!active}
      }
    }else if(action==='save' || action==='bulk'){
      authorize(isAdmin(role))
      const kind=choice(data.kind,KINDS)
      const entries=action==='bulk'?data.rows:[data.record]
      need(Array.isArray(entries)&&entries.length>0&&entries.length<=(action==='bulk'?40:1),'Submit between 1 and 40 records.')
      need(action!=='bulk' || kind==='games','Bulk import supports games.')
      for(const raw of entries){
        const old=records[kind].find(x=>x.id===raw?.id)
        if(action==='bulk') need(!old,'Bulk import only creates games. Edit existing games individually.','already-exists')
        else requiredRevision(data,old)
        const row=normalize(kind,raw,records,old)
        archived(records,old?.season??row.season??(kind==='seasons'?row.id:''),role,reason)
        if (kind==='seasons' && (old?.showPending??false)!==row.showPending) authorize(role.role==='superadmin')
        if (kind==='brackets' && old?.locked && role.role!=='superadmin') need(row.locked && reason,'Locked bracket edits require a reason and a Super Admin must unlock it.')
        if(kind==='games' && old?.bracket && records.brackets.find(b=>b.id===old.bracket)?.locked) {
          need(['bracket','round','home','away','homeFrom','awayFrom','homeSeed','awaySeed','bye'].every(k=>(old[k]??(k==='bye'?false:''))===(row[k]??'')) || reason,'Explain the locked bracket override.')
        }
        if((kind==='seasons' || kind==='divisions') && old && records.games.some(g=>g.season===(row.season??row.id) && hasScore(g))) {
          need(['breakers','pointCap','overtimePoints','forfeitPolicy'].every(k=>JSON.stringify(old[k]??null)===JSON.stringify(row[k]??null)) || reason,'Explain the midseason standings rule change.')
        }
        if(kind==='seasons' && old && (old.published!==row.published || old.status!==row.status || old.showPending!==row.showPending)) {
          const related=KINDS.flatMap(k=>records[k].filter(r=>r.season===row.id).map(r=>[k,r]))
          need(related.length<=450,'Ask an operator to migrate publication for this large season.')
          storeRecord(tx,kind,row,records,uid)
          for(const [k,r] of related) updateProjection(tx,k,r,records)
        }else storeRecord(tx,kind,row,records,uid)
        if(kind==='games' && row.bracket) for(const update of bracketUpdates(records.games,row,records.seasons.find(s=>s.id===row.season)?.forfeitPolicy)) {
          const before=records.games.find(x=>x.id===update.id)
          storeRecord(tx,'games',update,records,uid)
          log(tx,uid,actor,'bracket advanced','games',update.id,before,update,reason)
        }
        log(tx,uid,actor,old?'record updated':'record created',kind,row.id,old,row,reason)
      }
      result={ok:true,count:entries.length}
    }else if(action==='score'){
      const key=id(data.id)
      const game=records.games.find(g=>g.id===key)
      need(game,'Game not found.','not-found')
      archived(records,game.season,role,reason)
      const season=records.seasons.find(s=>s.id===game.season)
      const next=changeScore({game,role,actor:uid,teams:records.teams,action:data.scoreAction,home:data.home,away:data.away,side:data.side,reason,overtime:data.overtime,expected:data.expected,forfeit:data.forfeit,forfeitPolicy:season?.forfeitPolicy})
      const advances=bracketUpdates(records.games,next,season?.forfeitPolicy)
      storeRecord(tx,'games',next,records,uid)
      log(tx,uid,actor,data.scoreAction,'games',key,summary(game),summary(next),reason)
      for(const update of advances) {
        const before=records.games.find(x=>x.id===update.id)
        storeRecord(tx,'games',update,records,uid)
        log(tx,uid,actor,'bracket advanced','games',update.id,before,update,reason)
      }
      if(next.type==='championship'){
        const key='game-'+next.id
        const old=records.championships.find(r=>r.id===key)
        const homeWon=hasScore(next)&&next.official.home>next.official.away
        const team=records.teams.find(t=>t.id===next[homeWon?'home':'away'])
        const other=records.teams.find(t=>t.id===next[homeWon?'away':'home'])
        const decided=hasScore(next)&&(next.status!=='forfeited'||season?.forfeitPolicy==='score')
        const entry={id:key,season:next.season,division:next.division,game:next.id,source:next.source||'',winnerTown:decided?team.town:'',winnerName:decided?team.name:'',runnerUp:decided?other.name:'',verification:decided?'verified':'review',published:next.published&&decided}
        storeRecord(tx,'championships',entry,records,uid)
        log(tx,uid,actor,'championship updated','championships',key,old,entry,reason)
      }
      result={ok:true,revision:next.revision}
    }else if(action==='roster'){
      authorize(isAdmin(role))
      const key=id(data.id)
      const team=records.teams.find(r=>r.id===key)
      need(team,'Team not found.','not-found')
      archived(records,team.season,role,reason)
      const ref=doc('rosters',key)
      const before=(await tx.get(ref)).data()
      requiredRevision(data,before)
      need(Array.isArray(data.players)&&data.players.length<=100,'Rosters can have up to 100 players.')
      const players=data.players.map(p=>({name:required(p.name,110),jersey:p.jersey===''?'':String(number(Number(p.jersey),0,999)),grade:number(Number(p.grade),1,6),position:text(p.position,40),status:choice(p.status??'active',['active','inactive'])}))
      const after={id:key,team:key,season:team.season,players,updatedAt:now(),updatedBy:uid}
      tx.set(ref,after)
      log(tx,uid,actor,'roster updated','rosters',key,{count:before?.players.length??0},{count:players.length},reason)
    }else if(action==='rosterExport'){
      const key=id(data.id)
      authorize(canSeeRoster(role,records.teams.find(r=>r.id===key)))
      const roster=(await tx.get(doc('rosters',key))).data()
      result={players:roster?.players??[],exportedAt:now(),actor:email}
      log(tx,uid,actor,'roster exported','rosters',key,null,{count:result.players.length},reason)
      tx.set(rateRef,{window,hits:hits+1})
      return result
    }else if(action==='scheduleRequest'){
      const key=id(data.id)
      const game=records.games.find(r=>r.id===key)
      authorize(game && sides(role,game,records.teams).length>0)
      archived(records,game.season,role,reason)
      const after={id:randomUUID(),uid,email,game:key,status:'open',details:required(data.details,1500),at:now()}
      tx.create(doc('requests',after.id),after)
      log(tx,uid,actor,'schedule change requested','requests',after.id,null,after)
    }else if(action==='requestDecision'){
      authorize(isAdmin(role))
      const key=id(data.id)
      const ref=doc('requests',key)
      const before=(await tx.get(ref)).data()
      need(before?.status==='open','Request already resolved or missing.','failed-precondition')
      const after={...before,status:choice(data.status,['approved','declined']),reason:required(reason,700),decidedAt:now(),decidedBy:uid}
      tx.set(ref,after)
      log(tx,uid,actor,'schedule request '+after.status,'requests',key,before,after,reason)
    }else need(false,'Unknown league operation.')
    tx.set(rateRef,{window,hits:hits+1})
    tx.create(receipt,{result,at:now()})
    return result
  })
})
