import {KINDS} from './domain.mjs'

export const root = db=>db.collection('cfl').doc('v1')
export const projectionID=(kind,id)=>kind+'--'+id

export function publicRecord(kind,row,records) {
  if (!KINDS.includes(kind) || !row?.published) return null
  const season=records.seasons?.find(s=>s.id===row.season)
  if (row.season && (!season?.published || season.status==='draft')) return null
  const {proposal,dispute,updatedBy,...record}=row
  if (kind==='games' && ['pending','disputed'].includes(record.status) && !season?.showPending) record.status='scheduled'
  if (kind==='championships' && record.verification!=='verified') {
    record.winnerTown=''; record.winnerName=''; record.runnerUp=''
  }
  return {kind,...record}
}
