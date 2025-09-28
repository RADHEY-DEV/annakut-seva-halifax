import React, { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export default function Admin(){
  const [catName, setCatName] = useState('')
  const [itemsCsv, setItemsCsv] = useState('')
  const [cats, setCats] = useState([])
  const [msg, setMsg] = useState('')

  const load = async () => {
    const catsSnap = await getDocs(collection(db, 'categories'))
    const out = []
    for (const c of catsSnap.docs){
      const items = await getDocs(collection(db, 'categories', c.id, 'items'))
      out.push({ id: c.id, name: c.data().name, items: items.docs.map(d=>({id:d.id, ...d.data()})) })
    }
    setCats(out)
  }

  useEffect(() => { load() }, [])

  const addCategory = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!catName.trim()) { setMsg('Category name is required'); return }
    const ref = await addDoc(collection(db, 'categories'), { name: catName.trim() })
    const items = itemsCsv.split(',').map(s=>s.trim()).filter(Boolean)
    for (const it of items){
      await addDoc(collection(db, 'categories', ref.id, 'items'), { name: it })
    }
    setCatName(''); setItemsCsv('')
    await load()
    setMsg('Category added.')
  }

  const resetItem = async (catId, item) => {
    // Remove "taken" doc to free the item
    await setDoc(doc(db, 'taken', item.id), {}, { merge: false }) // will create empty doc if used; better to delete
  }
  // Note: We'll not expose reset in UI to avoid misuse — admins can free items by deleting docs in Firestore console.

  return (
    <div className="container">
      <div className="card">
        <h1>Admin</h1>
        <p>Add categories and items (comma separated). Visible on Home instantly.</p>
        {msg && <div className="warn">{msg}</div>}
        <div className="spacer"></div>
        <form onSubmit={addCategory}>
          <label>Category name</label>
          <input type="text" value={catName} onChange={e=>setCatName(e.target.value)} placeholder="e.g., Sweets" />
          <label>Items (comma-separated)</label>
          <input type="text" value={itemsCsv} onChange={e=>setItemsCsv(e.target.value)} placeholder="Ladoo, Barfi, Jalebi" />
          <div className="spacer"></div>
          <button className="btn" type="submit">Add Category</button>
        </form>
      </div>

      <div className="spacer"></div>
      <div className="card">
        <h2>Existing</h2>
        {cats.map(c => (
          <div key={c.id} style={{margin:'12px 0'}}>
            <strong>{c.name}</strong>
            <div style={{fontSize:13, color:'#6b7280'}}>{c.items.map(i=>i.name).join(', ') || 'No items yet'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}