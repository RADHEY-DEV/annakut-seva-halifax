import React, { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'

export default function Dashboard(){
  const [rows, setRows] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'pledges'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const out = []
      snap.forEach(d => {
        const x = d.data()
        out.push({ id: d.id, ...x })
      })
      setRows(out)
    })
  }, [])

  // Group by email: items combined, count total items, latest activity
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const key = (r.email || '(no email)').trim().toLowerCase() || '(no email)'
      const when = r.createdAt?.toDate
        ? r.createdAt.toDate()
        : (r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000) : null)
      const entry = map.get(key) || {
        email: r.email || '(no email)',
        name: r.name || '',
        phone: r.phone || '',
        items: [],
        count: 0,
        lastAt: null
      }
      const items = (r.items || []).map(i => i.name)
      entry.items.push(...items)
      entry.count += items.length
      if (when && (!entry.lastAt || when > entry.lastAt)) entry.lastAt = when
      if (!entry.name && r.name) entry.name = r.name
      if (!entry.phone && r.phone) entry.phone = r.phone
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a,b) => (b.lastAt?.getTime()||0) - (a.lastAt?.getTime()||0))
  }, [rows])

  const exportToExcel = () => {
    const data = grouped.map(g => ({
      Email: g.email,
      Name: g.name,
      Phone: g.phone,
      'Total Items Taken': g.count,
      Items: g.items.join(', '),
      'Last Activity': g.lastAt ? g.lastAt.toLocaleString() : ''
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, 'By Email')
    XLSX.writeFile(wb, 'annakut_pledges_by_email.xlsx')
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h1 className="header-title">Dashboard</h1>
          <button className="btn secondary" onClick={exportToExcel}>Export to Excel</button>
        </div>
        <p>Grouped by email with total items taken.</p>
        <div className="spacer"></div>
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Total Items Taken</th>
              <th>Items</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g, idx) => (
              <tr key={idx}>
                <td>{g.email}</td>
                <td>{g.name}</td>
                <td>{g.phone}</td>
                <td>{g.count}</td>
                <td>{g.items.join(', ')}</td>
                <td>{g.lastAt ? g.lastAt.toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
