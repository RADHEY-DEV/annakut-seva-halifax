import React, { useState } from 'react'

export default function CategoryList({ data, takenMap, selected, toggleItem }){
  const [openIds, setOpenIds] = useState({})

  const toggleOpen = (id) => setOpenIds(s => ({...s, [id]: !s[id]}))

  return (
    <div className="accordion">
      {data.map(cat => (
        <div className="accordion-item" key={cat.id}>
          <div className="accordion-header" onClick={()=>toggleOpen(cat.id)}>
            <strong>{cat.name}</strong>
            <span className="badge">{openIds[cat.id] ? 'Hide' : 'Show'}</span>
          </div>
          {openIds[cat.id] && (
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
                    <span style={{fontWeight:500, color: isTaken ? '#b91c1c' : '#065f46'}}>
                      {item.name}
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
      ))}
    </div>
  )
}