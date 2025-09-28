import React, { useMemo, useState } from 'react'

export default function CategoryList({ data, takenMap, selected, toggleItem, search }){
  const [openIds, setOpenIds] = useState({})
  const q = (search || '').trim().toLowerCase()

  // Filter items by live query; when searching, categories auto-expand
  const view = useMemo(() => {
    return data.map(cat => {
      const items = q
        ? cat.items.filter(i => (i.name || '').toLowerCase().includes(q))
        : cat.items
      return { ...cat, items }
    }).filter(cat => cat.items.length > 0 || !q)
  }, [data, q])

  const totalVisible = useMemo(() => view.reduce((acc, c) => acc + c.items.length, 0), [view])
  const toggleOpen = (id) => setOpenIds(s => ({...s, [id]: !s[id]}))

  const highlight = (text) => {
    if (!q) return text
    const t = String(text || '')
    const idx = t.toLowerCase().indexOf(q)
    if (idx === -1) return t
    const before = t.slice(0, idx)
    const mid = t.slice(idx, idx + q.length)
    const after = t.slice(idx + q.length)
    return <>{before}<mark className="hl">{mid}</mark>{after}</>
  }

  if (q && totalVisible === 0) {
    return <div className="warn">No items match “{search}”.</div>
  }

  return (
    <div className="accordion">
      {view.map(cat => {
        const isOpen = q ? true : !!openIds[cat.id]
        return (
          <div className="accordion-item" key={cat.id}>
            <div
              className="accordion-header"
              onClick={()=>!q && toggleOpen(cat.id)}
              style={{cursor: q ? 'default' : 'pointer'}}
            >
              <strong>{cat.name}</strong>
              {!q && <span className="badge">{isOpen ? 'Hide' : 'Show'}</span>}
              {q && <span className="badge">{cat.items.length} match{cat.items.length!==1?'es':''}</span>}
            </div>
            {isOpen && (
              <div className="accordion-body">
                {cat.items.map(item => {
                  const isTaken = !!takenMap[item.id]
                  const isSelected = !!selected[item.id]
                  return (
                    <div className="item-row" key={item.id}>
                      <input
                        type="checkbox"
                        disabled={isTaken}
                        checked={isSelected}
                        onChange={()=>toggleItem(item)}
                      />
                      <span className={`item-name ${isTaken ? 'taken' : 'free'}`}>
                        {highlight(item.name)}
                      </span>
                      <span className={'badge ' + (isTaken ? 'red' : 'green')}>
                        {isTaken ? 'Taken' : 'Available'}
                      </span>
                      {isTaken && <span style={{fontSize:12, color:'#6b7280'}}>by {takenMap[item.id].byName}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
