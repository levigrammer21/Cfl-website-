import {getFirestore,connectFirestoreEmulator,collection,getDocs,limit,orderBy,query,startAfter,documentId} from 'firebase/firestore'
import {app,emulator,emulatorHost} from './firebase-app.js'

const db=getFirestore(app)
if(emulator)connectFirestoreEmulator(db,emulatorHost,8080)
export async function loadPublished(){
  const docs=collection(db,'cfl','v1','published')
  const rows={}
  let cursor
  do{
    const q=query(docs,orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(300))
    const snapshot=await getDocs(q)
    for(const doc of snapshot.docs) {
      const {kind,...data}=doc.data()
      ;(rows[kind]??=[]).push(data)
    }
    cursor=snapshot.size===300?snapshot.docs.at(-1):null
  }while(cursor)
  return rows
}
export async function fileBlob(id){
  const base=emulator?'http://'+emulatorHost+':5001/demo-cfl/us-central1/':'https://us-central1-pokemongridiron.cloudfunctions.net/'
  const response=await fetch(base+'cflDocument?'+new URLSearchParams({id}))
  if(!response.ok)throw new Error('The document is unavailable.')
  return response.blob()
}
