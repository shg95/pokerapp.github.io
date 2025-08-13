import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import clsx from 'classnames'
import { createSessionDoc } from '@/lib/realtime'

const FIB = [0, 1, 2, 3, 5, 8, 13, 20, 40, 100]

type Participant = { id: string; name: string; value: number | null }

function useUrlSearchParams() {
  const [sp, setSp] = useState(() => new URLSearchParams(window.location.search))
  useEffect(() => {
    const onPop = () => setSp(new URLSearchParams(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const setParams = (entries: Record<string, string | undefined>) => {
    const next = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(entries)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    const newUrl = `${window.location.pathname}?${next.toString()}${window.location.hash}`
    window.history.replaceState({}, '', newUrl)
    setSp(next)
  }
  return [sp, setParams] as const
}

export default function App() {
  const [params, setParams] = useUrlSearchParams()

  const sessionId = params.get('s') || ''
  const nameFromUrl = params.get('n') || ''

  const [name, setName] = useState(nameFromUrl)
  const [story, setStory] = useState('')
  const [reveal, setReveal] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myId, setMyId] = useState<string>(() => nanoid())

  const joined = participants.some((p) => p.id === myId)

  // Realtime binding via Yjs when sessionId exists
  useEffect(() => {
    if (!sessionId) return
    const { provider, yStory, yReveal, yAdmin, yParts, getState, setStory: rtSetStory, setReveal: rtSetReveal, setAdminKey: rtSetAdmin, upsertParticipant, removeParticipant, clearVotes } = createSessionDoc(sessionId)

    // Initialize doc if empty
    const st = getState()
    if (!st.adminKey) rtSetAdmin(nanoid(12))
    if (!st.story) rtSetStory(story || 'Untitled Story')

    const updateFromDoc = () => {
      const s = getState()
      setStory(s.story)
      setReveal(s.reveal)
      setAdminKey(s.adminKey)
      setParticipants(s.participants)
      const me = s.participants.find((p) => p.id === myId)
      setSelected(me?.value ?? null)
    }

    const storyObs = () => setStory(yStory.toString())
    const revealObs = () => setReveal(Boolean(yReveal.get('value')))
    const adminObs = () => setAdminKey(String(yAdmin.get('key') || ''))
    const partsObs = () => {
      const arr = yParts.toArray() as any
      setParticipants(arr)
      const me = (arr as Participant[]).find((p) => p.id === myId)
      setSelected(me?.value ?? null)
    }

    updateFromDoc()
    yStory.observe(storyObs)
    yReveal.observe(revealObs)
    yAdmin.observe(adminObs)
    yParts.observe(partsObs)

    // Actions bound to state setters
    ;(window as any).__pp_actions = {
      rtSetStory,
      rtSetReveal,
      rtSetAdmin,
      upsertParticipant,
      removeParticipant,
      clearVotes,
    }

    return () => {
      yStory.unobserve(storyObs)
      yReveal.unobserve(revealObs)
      yAdmin.unobserve(adminObs)
      yParts.unobserve(partsObs)
      provider.disconnect()
    }
  }, [sessionId, myId])

  // Auto-join when user has a name and is not yet in the session
  useEffect(() => {
    if (!sessionId || !name || joined) return
    const a = (window as any).__pp_actions
    if (a?.upsertParticipant) a.upsertParticipant({ id: myId, name, value: null })
  }, [sessionId, name, joined, myId])

  // Keep my displayed name in sync if I already joined
  useEffect(() => {
    if (!sessionId || !joined) return
    const a = (window as any).__pp_actions
    a?.upsertParticipant?.({ id: myId, name: name || 'Anon', value: selected })
  }, [name, joined, myId, selected, sessionId])

  function newIdentity() {
    const a = (window as any).__pp_actions
    if (sessionId && a?.removeParticipant) a.removeParticipant(myId)
    const newId = nanoid()
    setMyId(newId)
    setSelected(null)
  }

  async function createSession() {
    const id = nanoid(8)
    const newAdminKey = nanoid(12)
    setParams({ s: id, n: name, k: newAdminKey })
    // After URL updates, the Yjs effect will initialize the doc
    setTimeout(() => {
      const a = (window as any).__pp_actions
      if (a?.rtSetAdmin) a.rtSetAdmin(newAdminKey)
      if (a?.rtSetStory) a.rtSetStory(story || 'Untitled Story')
      if (a?.upsertParticipant) a.upsertParticipant({ id: myId, name: name || 'Anon', value: null })
    }, 0)
  }

  async function joinSession() {
    if (!sessionId || !name) return
    const a = (window as any).__pp_actions
    if (a?.upsertParticipant) a.upsertParticipant({ id: myId, name, value: null })
  }

  async function selectValue(v: number) {
    setSelected(v)
    const a = (window as any).__pp_actions
    if (sessionId && a?.upsertParticipant) a.upsertParticipant({ id: myId, name: name || 'Anon', value: v })
    else setParticipants((prev) => prev.map((p) => (p.id === myId ? { ...p, name: name || 'Anon', value: v } : p)))
  }

  async function clearVote() {
    setSelected(null)
    const a = (window as any).__pp_actions
    if (sessionId && a?.upsertParticipant) a.upsertParticipant({ id: myId, name: name || 'Anon', value: null })
    else setParticipants((prev) => prev.map((p) => (p.id === myId ? { ...p, value: null } : p)))
  }

  async function doReveal(r: boolean) {
    if (!isAdmin) return
    if (!sessionId) return setReveal(r)
    const a = (window as any).__pp_actions
    if (a?.rtSetReveal) a.rtSetReveal(r)
  }

  async function resetVotes() {
    if (!isAdmin) return
    const a = (window as any).__pp_actions
    if (sessionId && a?.clearVotes) {
      a.clearVotes()
      a.rtSetReveal?.(false)
    } else {
      setParticipants((prev) => prev.map((p) => ({ ...p, value: null })))
      setReveal(false)
    }
  }

  async function deleteMe() {
    const a = (window as any).__pp_actions
    if (sessionId && a?.removeParticipant) a.removeParticipant(myId)
    setSelected(null)
  }

  async function updateStory(newStory: string) {
    if (!isAdmin) return
    if (!sessionId) return setStory(newStory || 'Untitled Story')
    const a = (window as any).__pp_actions
    if (a?.rtSetStory) a.rtSetStory(newStory || 'Untitled Story')
  }

  const isAdmin = params.get('k') === adminKey && !!adminKey
  const shareLink = sessionId ? `${location.origin}${location.pathname}?s=${sessionId}` : ''
  const adminLink = sessionId && isAdmin ? `${location.origin}${location.pathname}?s=${sessionId}&k=${adminKey}` : ''

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 shadow bg-white">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <h1 className="text-xl font-semibold">Planning Poker</h1>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {sessionId && (
              <a className="underline" href={shareLink}>Share session link</a>
            )}
            {sessionId && isAdmin && (
              <>
                <button
                  className="px-3 py-1 rounded border"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(adminLink)
                    } catch {
                      /* fallback */
                      prompt('Copy admin link', adminLink)
                    }
                  }}
                >
                  Copy admin link
                </button>
                <button className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={() => doReveal(!reveal)}>
                  {reveal ? 'Hide' : 'Reveal'}
                </button>
                <button className="px-3 py-1 rounded border" onClick={resetVotes}>Reset</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto p-4 grid gap-6">
        {!sessionId ? (
          <section className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm">Your name</span>
              <input className="border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Story title</span>
              <input className="border rounded p-2" value={story} onChange={(e) => setStory(e.target.value)} placeholder="As a user, I want..." />
            </label>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={createSession}>
                Create session
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-2">
              <div className="flex items-center gap-3">
                <input className="border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                <button className="px-3 py-2 bg-gray-900 text-white rounded" onClick={joinSession} disabled={!name || joined}>{joined ? 'Joined' : 'Join'}</button>
                <button className="px-3 py-2 border rounded" onClick={deleteMe}>Leave</button>
                <button className="px-3 py-2 border rounded" onClick={newIdentity} title="Generate a new identity for this tab">New identity</button>
                {isAdmin ? (
                  <span className="text-xs text-green-700 border border-green-700 rounded px-2 py-1">Admin</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Story:</span>
                {isAdmin ? (
                  <input
                    className="flex-1 min-w-0 border rounded p-2"
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    onBlur={(e) => updateStory(e.target.value)}
                  />
                ) : (
                  <h2 className="text-lg font-medium">{story}</h2>
                )}
              </div>
            </section>

            <section>
              <div className="flex flex-wrap gap-3">
                {FIB.map((v) => (
                  <button
                    key={v}
                    className={clsx(
                      'w-16 h-24 rounded shadow bg-white border-2 text-xl font-semibold flex items-center justify-center',
                      selected === v && 'border-indigo-600',
                    )}
                    onClick={() => selectValue(v)}
                  >
                    {v}
                  </button>
                ))}
                <button className="w-16 h-24 rounded shadow bg-white border text-xl" onClick={clearVote}>--</button>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="font-medium">Participants</h3>
              <div className="flex flex-wrap gap-3">
                {participants.map((p) => (
                  <div key={p.id} className="w-36 p-3 rounded border bg-white">
                    <div className="font-medium truncate">{p.name || 'Anon'}</div>
                    <div className="mt-2 text-2xl h-8">
                      {reveal ? (p.value ?? '—') : (p.value != null ? '•' : '—')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-500 py-6">
        Realtime via Yjs. Default server: demos.yjs.dev. Safe to host on static hosts.
      </footer>
    </div>
  )
}
