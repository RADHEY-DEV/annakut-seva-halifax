import React, { useEffect, useState } from 'react'
import { addDoc, collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx' // reads .xlsx/.csv (values only)

/**
 * Supported import formats:
 *
 * A) EXCEL with first row as CATEGORY HEADERS (what you need):
 *    Row 1:  | Sweets | Savory | Fruits | ...
 *    Row 2+: | Ladoo  | Khakhra| Apple  | ...
 *             Barfi   | Chevdo | Banana | ...
 *    -> Each column under a header is an item of that category.
 *
 * B) CSV / Paste fallback (no styles):
 *    "# Category" or "**Category**" marker lines, followed by item lines.
 *
 * Replace mode:
 *    - "Replace all" deletes all categories & their items (and optionally all "taken") before import.
 *    - Pledges are NOT modified.
 */

export default function Admin(){
  const [catName, setCatName] = useState('')
  const [itemsCsv, setItemsCsv] = useState('')
  const [cats, setCats] = useState([])
  const [msg, setMsg] = useState('')

  // Bulk Import UI state
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [importStatus, setImportStatus] = useState('')
  const [fileName, setFileName] = useState('')

  // Replace mode toggles
  const [replaceAll, setReplaceAll] = useState(true)
  const [clearTaken, setClearTaken] = useState(true)

  // ----- Load existing (for display) -----
  const load = async () => {
    const catsSnap = await getDocs(collection(db, 'categories'))
    const out = []
    for (const c of catsSnap.docs){
      const items = await getDocs(collection(db, 'categories', c.id, 'items'))
      out.push({ id: c.id, name: c.data().name, items: items.docs.map(d=>({id:d.id, ...d.data()})) })
    }
    out.sort((a,b) => a.name.localeCompare(b.name))
    setCats(out)
  }
  useEffect(() => { load() }, [])

  // Quick single-category add
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

  // ---------- Parser helpers ----------

  // Fallback parser for "# Category" or "**Category**" pasted lines
  const parseLinesToMap = (lines) => {
    const map = new Map() // category -> Set(items)
    let currentCat = null
    const isMarkdownBold = (s) => /^\*\*(.+)\*\*$/.test(s)
    const unMarkdown = (s) => s.replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim()

    for (const raw of lines) {
      const line = String(raw || '').trim()
      if (!line) continue
      if (line.startsWith('#')) {
        const name = line.replace(/^#+\s*/, '').trim()
        if (name) { currentCat = name; if (!map.has(name)) map.set(name, new Set()) }
      } else if (isMarkdownBold(line)) {
        const name = unMarkdown(line)
        if (name) { currentCat = name; if (!map.has(name)) map.set(name, new Set()) }
      } else if (currentCat) {
        map.get(currentCat).add(line)
      }
    }
    return map
  }

  // NEW: Parse "headers across columns" format from a 2D array of rows (SheetJS header:1)
  const parseHeaderColumnsToMap = (rows) => {
    const map = new Map()
    if (!rows || rows.length === 0) return map

    const headerRow = rows[0] || []
    const headerNames = headerRow.map(h => String(h ?? '').trim())

    // Count how many non-empty headers exist
    const nonEmptyHeaders = headerNames
      .map((h, idx) => ({ h, idx }))
      .filter(x => x.h.length > 0)

    if (nonEmptyHeaders.length === 0) return map

    // Build sets for each header
    for (const { h, idx } of nonEmptyHeaders) {
      if (!map.has(h)) map.set(h, new Set())
      // Walk down the rows in that column to collect items
      for (let r = 1; r < rows.length; r++) {
        const cell = rows[r]?.[idx]
        const val = String(cell ?? '').trim()
        if (val) map.get(h).add(val)
      }
    }
    return map
  }

  const buildPreview = (map) => {
    let catCount = 0, itemCount = 0
    const preview = []
    for (const [name, setItems] of map.entries()) {
      const items = Array.from(setItems)
      preview.push({ name, items })
      catCount++
      itemCount += items.length
    }
    // Sort categories/items for stable preview
    preview.sort((a,b) => a.name.localeCompare(b.name))
    preview.forEach(p => p.items.sort((a,b)=>a.localeCompare(b)))
    setImportPreview({ preview, catCount, itemCount, map })
    setImportStatus('')
  }

  // ---------- File handlers ----------

  // Try to detect & parse the "headers across columns" first; otherwise fallback to marker format
  const handleFile = async (file) => {
    setFileName(file?.name || '')
    if (!file) return
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) // 2D array

      // Heuristic: if first row has 2+ non-empty cells OR (>=1 header and >=2 columns), treat as header-columns format
      const headerRow = rows[0] || []
      const nonEmptyHeaderCount = headerRow.filter(c => String(c ?? '').trim() !== '').length
      const isHeaderColumns =
        (nonEmptyHeaderCount >= 2) || (nonEmptyHeaderCount >= 1 && headerRow.length >= 2)

      const map = isHeaderColumns
        ? parseHeaderColumnsToMap(rows)
        : parseLinesToMap(
            rows
              .map(r => (r || [])[0]) // first column as a line
              .filter(v => v !== undefined && v !== null)
              .map(v => String(v))
          )

      if (map.size === 0) {
        setImportPreview(null)
        setImportStatus('No categories/items detected. Make sure row 1 has category names across columns, with items below.')
        return
      }
      buildPreview(map)
    } catch (err) {
      console.error('Import error:', err)
      setImportPreview(null)
      setImportStatus('Failed to read file. Ensure it is a valid .xlsx/.csv and try again.')
    }
  }

  // Paste text → supports "# Category" and "**Category**"
  const previewFromText = () => {
    const lines = importText.split(/\r?\n/)
    const map = parseLinesToMap(lines)
    buildPreview(map)
  }

  // ---------- Firestore writes (chunked) ----------

  const commitDeletes = async (refs) => {
    const CHUNK = 400
    for (let i=0; i<refs.length; i+=CHUNK) {
      const batch = writeBatch(db)
      for (const ref of refs.slice(i, i+CHUNK)) batch.delete(ref)
      await batch.commit()
    }
  }

  const commitSets = async (writes) => {
    const CHUNK = 400
    for (let i=0; i<writes.length; i+=CHUNK) {
      const batch = writeBatch(db)
      for (const w of writes.slice(i, i+CHUNK)) batch.set(w.ref, w.data)
      await batch.commit()
    }
  }

  const importToFirestore = async () => {
    if (!importPreview?.map) return
    setImportStatus(replaceAll
      ? 'Deleting existing categories/items (and taken if selected)...'
      : 'Preparing import (merge)...'
    )
    try {
      // Replace-all: wipe categories & items (and optionally taken)
      if (replaceAll) {
        const toDelete = []
        const catsSnap = await getDocs(collection(db, 'categories'))
        for (const c of catsSnap.docs) {
          const itemsSnap = await getDocs(collection(db, 'categories', c.id, 'items'))
          itemsSnap.forEach(it => toDelete.push(it.ref))
          toDelete.push(c.ref)
        }
        if (clearTaken) {
          const takenSnap = await getDocs(collection(db, 'taken'))
          takenSnap.forEach(t => toDelete.push(t.ref))
        }
        await commitDeletes(toDelete)
      }

      // Build writes from preview
      setImportStatus(prev => prev + '\nImporting new categories/items...')
      const writes = []

      if (replaceAll) {
        for (const [catName, itemSet] of importPreview.map.entries()) {
          const catRef = doc(collection(db, 'categories'))
          writes.push({ ref: catRef, data: { name: catName.trim() } })
          for (const item of itemSet) {
            const itemName = String(item).trim()
            if (!itemName) continue
            const itemRef = doc(collection(db, 'categories', catRef.id, 'items'))
            writes.push({ ref: itemRef, data: { name: itemName } })
          }
        }
      } else {
        // Merge mode: de-dup and append
        const existingCatsSnap = await getDocs(collection(db, 'categories'))
        const existingByLower = new Map()
        for (const d of existingCatsSnap.docs) {
          const nm = (d.data().name || '').trim()
          existingByLower.set(nm.toLowerCase(), { id: d.id, name: nm })
        }
        const existingItemsByCat = new Map()
        for (const { id } of Array.from(existingByLower.values())) {
          const its = await getDocs(collection(db, 'categories', id, 'items'))
          const set = new Set()
          its.forEach(x => set.add(String(x.data().name || '').trim().toLowerCase()))
          existingItemsByCat.set(id, set)
        }
        for (const [catName, itemSet] of importPreview.map.entries()) {
          const key = catName.trim().toLowerCase()
          let catId = existingByLower.get(key)?.id
          if (!catId) {
            const catRef = doc(collection(db, 'categories'))
            writes.push({ ref: catRef, data: { name: catName.trim() } })
            catId = catRef.id
            existingItemsByCat.set(catId, new Set())
          }
          const exist = existingItemsByCat.get(catId) || new Set()
          for (const item of itemSet) {
            const nm = String(item).trim()
            if (!nm) continue
            if (exist.has(nm.toLowerCase())) continue
            const itemRef = doc(collection(db, 'categories', catId, 'items'))
            writes.push({ ref: itemRef, data: { name: nm } })
            exist.add(nm.toLowerCase())
          }
        }
      }

      await commitSets(writes)
      setImportStatus(`Done. Imported ${importPreview.catCount} categories and ${importPreview.itemCount} items${clearTaken ? ' (cleared taken).' : '.'}`)
      await load()
    } catch (e) {
      console.error(e)
      setImportStatus('Import failed: ' + String(e.message || e))
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Admin</h1>
        <p>Add a single category, or use Bulk Import below.</p>
        {msg && <div className="warn">{msg}</div>}
        <div className="spacer"></div>

        {/* Quick single-category add */}
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

      {/* BULK IMPORT */}
      <div className="card">
        <h2>Bulk Import</h2>
        <p>
          <strong>Excel (first row = categories, columns = items)</strong><br/>
          Put category names in <em>row 1</em> across columns, and list items <em>below each category</em> in the same column.<br/>
          Example: Row 1: <code>Sweets | Savory | Fruits</code>; Row 2+: items under each column.<br/>
          <strong>CSV / Paste</strong>: Use <code># Category</code> or <code>**Category**</code>.
        </p>

        <div className="warn" style={{margin:'12px 0'}}>
          <strong>Replace mode</strong> — destructive:
          <div style={{marginTop:8}}>
            <label style={{display:'flex', alignItems:'center', gap:8}}>
              <input type="checkbox" checked={replaceAll} onChange={e=>setReplaceAll(e.target.checked)} />
              Wipe ALL existing categories & items before import
            </label>
            <label style={{display:'flex', alignItems:'center', gap:8, marginTop:6}}>
              <input type="checkbox" checked={clearTaken} onChange={e=>setClearTaken(e.target.checked)} />
              Also clear ALL taken statuses
            </label>
            <div style={{fontSize:12, marginTop:6, color:'#cbd5e1'}}>
              Pledges are not changed.
            </div>
          </div>
        </div>

        {/* File upload */}
        <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
          <input type="file" accept=".xlsx,.csv" onChange={e => handleFile(e.target.files?.[0])} />
          {fileName && <span style={{color:'#94a3b8'}}>Selected: {fileName}</span>}
        </div>

        <div className="spacer"></div>

        {/* Paste area */}
        <label>Or paste your list (supports # Category or **Category**)</label>
        <textarea
          rows={8}
          value={importText}
          onChange={e=>setImportText(e.target.value)}
          placeholder={`# Sweets
Ladoo
Barfi
# Savory
Khakhra
Chevdo`}
          style={{width:'100%', border:'1px solid #1f2937', borderRadius:12, background:'#0b1220', color:'#e5e7eb', padding:'10px 12px'}}
        />
        <div className="spacer"></div>
        <button className="btn secondary" onClick={previewFromText} type="button">Preview from Pasted Text</button>

        {importPreview && (
          <>
            <div className="spacer"></div>
            <div className="warn">
              <strong>Preview:</strong> {importPreview.catCount} categories, {importPreview.itemCount} items detected.
            </div>
            <div className="spacer"></div>
            <button className="btn" onClick={importToFirestore} type="button">
              Import {replaceAll ? '(Replace All)' : '(Merge)'}
            </button>
            {importStatus && (<><div className="spacer"></div><div className="warn">{importStatus}</div></>)}
          </>
        )}
      </div>

      <div className="spacer"></div>
      <div className="card">
        <h2>Existing</h2>
        {cats.map(c => (
          <div key={c.id} style={{margin:'12px 0'}}>
            <strong>{c.name}</strong>
            <div style={{fontSize:13, color:'#94a3b8'}}>{c.items.map(i=>i.name).join(', ') || 'No items yet'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
