import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'

export default function Login(){
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const nav = useNavigate()
  const loc = useLocation()
  const from = loc.state?.from?.pathname || '/'

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try{
      await login(email, password)
      nav(from, { replace: true })
    }catch(err){
      setError(err.message)
    }
  }

  return (
    <div className="container">
      <div className="card" style={{maxWidth:420, margin:'0 auto'}}>
        <h1>Login</h1>
        <div className="spacer"></div>
        {error && <div className="warn">{error}</div>}
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          <div className="spacer"></div>
          <button className="btn" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  )
}