import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export type Participant = { id: string; name: string; value: number | null }
export type SessionState = {
  story: string
  reveal: boolean
  adminKey: string
  participants: Participant[]
}

export function createSessionDoc(sessionId: string) {
  const doc = new Y.Doc()
  const WS_URL = (import.meta as any).env?.VITE_YWS_URL || 'wss://demos.yjs.dev'
  const provider = new WebsocketProvider(WS_URL, `planning-poker-${sessionId}`, doc)

  const yStory = doc.getText('story')
  const yReveal = doc.getMap('reveal')
  const yAdmin = doc.getMap('admin')
  const yParts = doc.getArray<Participant>('participants')

  function getState(): SessionState {
    return {
      story: yStory.toString() || 'Untitled Story',
      reveal: Boolean(yReveal.get('value')),
      adminKey: String(yAdmin.get('key') || ''),
      participants: yParts.toArray(),
    }
  }

  function setStory(val: string) {
    yStory.delete(0, yStory.length)
    yStory.insert(0, val)
  }

  function setReveal(val: boolean) {
    yReveal.set('value', val)
  }

  function setAdminKey(val: string) {
    yAdmin.set('key', val)
  }

  function upsertParticipant(p: Participant) {
    const arr = yParts
    const idx = arr.toArray().findIndex((x) => x.id === p.id)
    if (idx >= 0) arr.delete(idx, 1)
    arr.insert(idx >= 0 ? idx : arr.length, [p])
  }

  function removeParticipant(id: string) {
    const arr = yParts
    const idx = arr.toArray().findIndex((x) => x.id === id)
    if (idx >= 0) arr.delete(idx, 1)
  }

  function clearVotes() {
    const arr = yParts
    const copy = arr.toArray().map((p) => ({ ...p, value: null }))
    arr.delete(0, arr.length)
    arr.insert(0, copy)
  }

  return {
    doc,
    provider,
    yStory,
    yReveal,
    yAdmin,
    yParts,
    getState,
    setStory,
    setReveal,
    setAdminKey,
    upsertParticipant,
    removeParticipant,
    clearVotes,
  }
}
