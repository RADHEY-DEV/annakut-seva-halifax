import React, { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import CategoryList from '../components/CategoryList.jsx'
import emailjs from 'emailjs-com'

export default function Home(){
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [cats, setCats] = useState([])
  const [selected, setSelected] = useState({})
  const [takenMap, setTakenMap] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name'))
    getDocs(q).then(async snap => {
      const catsRaw = []
      for (const c of snap.docs){
        const itemsSnap = await getDocs(collection(db, 'categories', c.id, 'items'))
        catsRaw.push({
          id: c.id,
          name: c.data().name,
          items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        })
      }
      setCats(catsRaw)
    })

    // live taken map
    return onSnapshot(collection(db, 'taken'), snap => {
      const m = {}
      snap.forEach(d => m[d.id] = d.data())
      setTakenMap(m)
    })
  }, [])

  const toggleItem = (item) => {
    setSelected(s => ({ ...s, [item.id]: s[item.id] ? undefined : item }))
  }

  const chosenItems = useMemo(() => Object.values(selected).filter(Boolean), [selected])

  // --- Stats: total listed / taken / remaining
  const allItemIds = useMemo(() => {
    const ids = []
    for (const c of cats) for (const it of c.items) ids.push(it.id)
    return ids
  }, [cats])

  const totalItems = allItemIds.length
  const takenCount = useMemo(() => {
    const setIds = new Set(allItemIds)
    let n = 0
    for (const id of Object.keys(takenMap)) if (setIds.has(id)) n++
    return n
  }, [allItemIds, takenMap])
  const remaining = totalItems - takenCount

  const submit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (chosenItems.length === 0) {
      setMessage('Please select at least one item.')
      return
    }
    try{
      await runTransaction(db, async (trx) => {
        for (const it of chosenItems){
          const tRef = doc(db, 'taken', it.id)
          const tSnap = await trx.get(tRef)
          if (tSnap.exists()){
            throw new Error(`Item already taken: ${it.name}`)
          }
          trx.set(tRef, { byName: name, byEmail: email, byPhone: phone, itemName: it.name, at: Timestamp.now() })
        }
        const pledgeId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
        trx.set(doc(db, 'pledges', pledgeId), {
          name, email, phone,
          items: chosenItems.map(i => ({ id: i.id, name: i.name })),
          createdAt: Timestamp.now()
        })
      })

      // send email via EmailJS (client-side)
      if (import.meta.env.VITE_EMAILJS_SERVICE && import.meta.env.VITE_EMAILJS_TEMPLATE && import.meta.env.VITE_EMAILJS_PUBLIC) {
        try{
          const params = {
            to_email: email,            // EmailJS template must have "To email" = {{to_email}}
            to_name: name,
            from_name: 'Annakut Vaangi Seva',
            user_name: name,
            user_email: email,
            user_phone: phone,
            items: chosenItems.map(i=>i.name).join(', ')
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
          throw new Error('Your seva was saved, but sending the confirmation email failed. Check EmailJS config / logs.')
        }
      }

      setSelected({})
      setName(''); setEmail(''); setPhone('')
      setMessage('Thank you! Your seva has been recorded and a confirmation email has been sent (if configured).')
    }catch(err){
      setMessage(err.message)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="header-title">Annakut Vaangi Seva - Halifax</h1>
        <p>Jai Swaminarayan, Welcome to Annakut Vaangi Seva - Halifax. You will receive an email after submission of this form, please make sure to double check the list of items confirmed to you in the email and prepare according to the instructions in the email.</p>

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
            <div className="value green">{remaining < 0 ? 0 : remaining}</div>
          </div>
        </div>

        {message && <div className="spacer"></div>}
        {message && <div className="warn">{message}</div>}
        <div className="spacer"></div>

        {/* Form: fields stacked vertically */}
        <form onSubmit={submit}>
          <label>Name</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} required />

          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />

          <label>Phone</label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} required />

          <div className="spacer"></div>
          <h2>Items</h2>
          <CategoryList
            data={cats}
            takenMap={takenMap}
            selected={selected}
            toggleItem={toggleItem}
          />
          <div className="spacer"></div>
          <button className="btn success" type="submit">Submit</button>
        </form>
      </div>
    </div>
  )
}
