import React, { useEffect, useState } from 'react'
import { addDoc, collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'        // for CSV and non-styled imports
import ExcelJS from 'exceljs'       // for reading bold in .xlsx

/**
 * Bulk import formats supported:
 * 1) .XLSX (preferred): Column A only. Make category rows BOLD; put items under each category (not bold).
 * 2) CSV / Paste: One value per line in a single column. Use either:
 *    - "# Category"  (hash) OR
 *    - "**Category**" (Markdown-style bold)
 *    Lines after a category (until next category) are items.
 *
 * Replace mode (optional):
 * - Wipes all categories + items (and optionally all "taken") before importing.
 * - Pledges are NOT changed.
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

  // Quick single-category add (kept)
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

  // ---------- Parsing helpers ----------

  // Parse #/Markdown-bold markers in plain text lines
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

  // Build preview structure
  const buildPreview = (map) => {
    let catCount = 0, itemCount = 0
    const preview = []
    for (const [name, setItems] of map.entries()) {
      const items = Array.from(setItems)
      preview.push({ name, items })
      catCount++
      itemCount += items.length
    }
    setImportPreview({ preview, catCount, itemCount, map })
    setImportStatus('')
  }

  // ---------- File handlers ----------

  // XLSX with real bold detection
  const handleXlsxBold = async (file) => {
    const ab = await file.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(ab)
    const ws = wb.worksheets[0]
    const map = new Map()
    let currentCat = null

    // read only column A
    for (let r = 1; r <= ws.rowCount; r++) {
      const cell = ws.getRow(r).getCell(1)
      let txt = cell.value
      if (txt && typeof txt === 'object' && 'richText' in txt) {
        txt = txt.richText.map(rt => rt.text).join('')
      }
      txt = String(txt || '').trim()
      if (!txt) continue

      const bold = cell.font?.bold === true

      if (bold) {
        currentCat = txt
        if (!map.has(currentCat)) map.set(currentCat, new Set())
      } else if (currentCat) {
        map.get(currentCat).add(txt)
      }
    }
    return map
  }

  // CSV / other (no styles) → fall back to markers
  const handleCsvOrOther = async (file) => {
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const values = rows
      .map(r => (r || []).find(c => c !== null && c !== undefined && String(c).trim() !== ''))
      .filter(Boolean)
    return parseLinesToMap(values.map(v => String(v)))
  }

  // Entrypoint for file upload
  const handleFile = async (file) => {
    setFileName(file?.name || '')
    if (!file) return
    let map
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext === 'xlsx') {
      map = await handleXlsxBold(file)
    } else {
      map = await handleCsvOrOther(file) // supports "#"/"**" markers
    }
    buildPreview(map)
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
      // Replace-all: wipe categories, their items, and optionally all taken
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

      // Build writes from preview (no merge in replaceAll; otherwise append-only)
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
        // Merge mode: append new categories/items without deleting; de-dupe existing
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
        <p>Add categories and items (comma separated) OR use the bulk import below.</p>
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
          <strong>.XLSX (bold = category)</strong>: Put everything in column A. Make category rows <em>bold</em>, items normal.<br/>
          <strong>CSV / Paste</strong>: Use <code># Category</code> or <code>**Category**</code> markers.
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
          placeholder={`**Sweets**
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
