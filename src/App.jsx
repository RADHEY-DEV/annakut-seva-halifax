import React from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Admin from './pages/Admin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'

const Guard = ({ children, requireAdmin=false }) => {
  const { user, role, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="container"><div className="card">Loading...</div></div>
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />
  if (requireAdmin && role !== 'admin') return <Navigate to="/" replace />
  return children
}

const Nav = () => {
  const { user, role, logout } = useAuth()
  return (
    <div className="nav container" style={{justifyContent:'space-between'}}>
      {/* <div style={{display:'flex', gap:8}}>
        <Link className="link" to="/">Home</Link>
        <Link className="link" to="/admin">Admin</Link>
        <Link className="link" to="/dashboard">Dashboard</Link>
      </div> */}
        {/* <div>
        {user ? (<>
          <span style={{marginRight:8}}>{user.email} {role ? `(${role})` : ''}</span>
          <button className="btn secondary" onClick={logout}>Logout</button>
        </>) : (<Link className="link" to="/login">Login</Link>)}
      </div> */}
    </div>
  )
}

export default function App(){
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Guard requireAdmin={true}><Admin /></Guard>} />
        <Route path="/dashboard" element={<Guard requireAdmin={true}><Dashboard /></Guard>} />
        <Route path="/login" element={<Login />} />
      </Routes>
      <div className="container footer">© {new Date().getFullYear()} Annakut Vaangi Seva App - Developed by Pramukham Technologies</div>
    </AuthProvider>
  )
}
