import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import CategoryList from '../components/CategoryList.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import emailjs from 'emailjs-com'

export default function Home(){
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Data
  const [cats, setCats] = useState([])                // [{id, name}]
  const [itemsByCat, setItemsByCat] = useState({})    // { [catId]: [{id,name}] }
  const [takenMap, setTakenMap] = useState({})

  const [selected, setSelected] = useState({})
  const [message, setMessage] = useState('')          // used for errors
  const [search, setSearch] = useState('')            // live search, no button

  // Confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmInfo, setConfirmInfo] = useState({ name: '', email: '', items: [] })

  // keep per-category item subscriptions
  const itemUnsubs = useRef({})

  // ----- Realtime categories + taken -----
  useEffect(() => {
    const unsubCats = onSnapshot(
      query(collection(db, 'categories'), orderBy('name')),
      (snap) => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setCats(arr)
      },
      (err) => console.error('Categories snapshot error:', err)
    )

    const unsubTaken = onSnapshot(
      collection(db, 'taken'),
      (snap) => {
        const m = {}
        snap.forEach(d => (m[d.id] = d.data()))
        setTakenMap(m)
      },
      (err) => console.error('Taken snapshot error:', err)
    )

    return () => {
      unsubCats()
      unsubTaken()
      Object.values(itemUnsubs.current).forEach(fn => fn?.())
      itemUnsubs.current = {}
    }
  }, [])

  // ----- Realtime items per category -----
  useEffect(() => {
    const current = itemUnsubs.current
    const catIds = new Set(cats.map(c => c.id))

    // Unsubscribe removed categories
    for (const id of Object.keys(current)) {
      if (!catIds.has(id)) {
        current[id]?.()
        delete current[id]
        setItemsByCat(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }

    // Subscribe new categories
    cats.forEach(c => {
      if (!current[c.id]) {
        const unsub = onSnapshot(
          collection(db, 'categories', c.id, 'items'),
          (snap) => {
            const arr = snap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a,b)=> (a.name||'').localeCompare(b.name||''))
            setItemsByCat(prev => ({ ...prev, [c.id]: arr }))
          },
          (err) => console.error('Items snapshot error for cat', c.id, err)
        )
        current[c.id] = unsub
      }
    })
  }, [cats])

  // UI helpers
  const toggleItem = (item) => {
    setSelected(s => ({ ...s, [item.id]: s[item.id] ? undefined : item }))
  }
  const chosenItems = useMemo(() => Object.values(selected).filter(Boolean), [selected])

  const catsWithItems = useMemo(() => {
    return cats.map(c => ({ ...c, items: itemsByCat[c.id] || [] }))
  }, [cats, itemsByCat])

  // ----- Stats -----
  const allItemIds = useMemo(() => {
    const ids = []
    for (const c of catsWithItems) for (const it of c.items) ids.push(it.id)
    return ids
  }, [catsWithItems])

  const totalItems = allItemIds.length
  const takenCount = useMemo(() => {
    const setIds = new Set(allItemIds)
    let n = 0
    for (const id of Object.keys(takenMap)) if (setIds.has(id)) n++
    return n
  }, [allItemIds, takenMap])

  const remaining = Math.max(0, totalItems - takenCount)

  // ----- Submit: reads first, then writes (transaction) -----
  const submit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (chosenItems.length === 0) {
      setMessage('Please select at least one item.')
      return
    }

    // capture details for popup BEFORE we clear anything
    const chosenNames = chosenItems.map(i => i.name)

    try{
      await runTransaction(db, async (trx) => {
        // READ all taken docs first
        const tRefs = chosenItems.map(it => doc(db, 'taken', it.id))
        const snaps = await Promise.all(tRefs.map(ref => trx.get(ref)))

        // conflicts?
        for (let i = 0; i < snaps.length; i++) {
          if (snaps[i].exists()) {
            throw new Error(`Item already taken: ${chosenItems[i].name}`)
          }
        }

        // WRITE taken docs
        for (let i = 0; i < tRefs.length; i++) {
          const it = chosenItems[i]
          trx.set(tRefs[i], {
            byName: name,
            byEmail: email,
            byPhone: phone,
            itemName: it.name,
            at: Timestamp.now()
          })
        }

        // WRITE pledge
        const pledgeId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
        trx.set(doc(db, 'pledges', pledgeId), {
          name, email, phone,
          items: chosenItems.map(i => ({ id: i.id, name: i.name })),
          createdAt: Timestamp.now()
        })
      })

      // Send email AFTER success
      if (import.meta.env.VITE_EMAILJS_SERVICE && import.meta.env.VITE_EMAILJS_TEMPLATE && import.meta.env.VITE_EMAILJS_PUBLIC) {
        try{
          const params = {
            to_email: email,         // recipient
            to_name: name,           // <-- include name
            from_name: 'Annakut Vaangi Seva',
            user_name: name,         // <-- include name (2nd var if you prefer)
            user_email: email,
            user_phone: phone,
            items: chosenNames.join(', ')
          }
          await emailjs.send(
            import.meta.env.VITE_EMAILJS_SERVICE,
            import.meta.env.VITE_EMAILJS_TEMPLATE,
            params,
            import.meta.env.VITE_EMAILJS_PUBLIC
          )
          if (import.meta.env.VITE_ADMIN_EMAIL) {
            await emailjs.send(
              import.meta.env.VITE_EMAILJS_SERVICE,
              import.meta.env.VITE_EMAILJS_TEMPLATE,
              { ...params, to_email: import.meta.env.VITE_ADMIN_EMAIL, to_name: 'Admin' },
              import.meta.env.VITE_EMAILJS_PUBLIC
            )
          }
        }catch(err){
          console.warn('EmailJS error', err)
          // keep going; the seva is saved — show a warning if you want:
          setMessage('Saved, but sending the confirmation email failed. Please double-check your EmailJS settings.')
        }
      }

      // Show popup
      setConfirmInfo({ name, email, items: chosenNames })
      setConfirmOpen(true)

      // Reset form/selection
      setSelected({})
      setName(''); setEmail(''); setPhone('')

    }catch(err){
      setMessage(err.message)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="header-title">Annakut Vaangi Seva - Montreal</h1>
        <p>

        Jai Swāminārāyan! Happy Diwali & New Year. Welcome to Annakut Vaangi Seva App. After you submit, a confirmation pop-up will appear and
  you’ll receive an email. Please follow the instructions in that email — including Swaminarayan dietary guidelines — when preparing your items. Thank you for your seva.
        </p>

        {/* Stats */}
        <div className="stats">
          <div className="stat">
            <div className="label">Total items listed</div>
            <div className="value">{totalItems}</div>
          </div>
          <div className="stat">
            <div className="label">Total items taken</div>
            <div className="value red">{takenCount}</div>
          </div>
          <div className="stat">
            <div className="label">Total items remaining</div>
            <div className="value green">{remaining}</div>
          </div>
        </div>

        {message && <div className="spacer"></div>}
        {message && <div className="warn">{message}</div>}
        <div className="spacer"></div>

        {/* Form */}
        <form onSubmit={submit}>
          <label>Name</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} required />

          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />

          <label>Phone</label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} required />

          <div className="spacer"></div>

          {/* LIVE search (no button) */}
          <div className="searchbar">
            <input
              type="text"
              placeholder="Search items (start typing to filter)..."
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />
          </div>

          <div className="spacer"></div>
          <h2>Items</h2>
          <CategoryList
            data={cats.map(c => ({ ...c, items: itemsByCat[c.id] || [] }))}
            takenMap={takenMap}
            selected={selected}
            toggleItem={toggleItem}
            search={search}
          />
          <div className="spacer"></div>
          <button className="btn success" type="submit">Submit</button>
        </form>
      </div>

      {/* Confirmation Popup */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        name={confirmInfo.name}
        email={confirmInfo.email}
        items={confirmInfo.items}
      />
    </div>
  )
}
