import {getAuth,connectAuthEmulator} from 'firebase/auth'
import {getFunctions,httpsCallable,connectFunctionsEmulator} from 'firebase/functions'
import {app,emulator,emulatorHost} from './firebase-app.js'

export const auth=getAuth(app)
const fn=getFunctions(app,'us-central1')
if(emulator){
  connectAuthEmulator(auth,'http://'+emulatorHost+':9099',{disableWarnings:true})
  connectFunctionsEmulator(fn,emulatorHost,5001)
}
export const call=(action,data={})=>httpsCallable(fn,'cfl'+action)(data).then(r=>r.data)
