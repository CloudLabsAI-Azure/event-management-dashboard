import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async () => {
    setError('')
    try {
      const res = await api.post('/api/login', { email, password })
      if (res.data && res.data.token) {
  localStorage.setItem('dashboard_token', res.data.token)
  if (res.data.role) localStorage.setItem('dashboard_role', String(res.data.role))
        window.location.href = '/'
      } else if (res.data && res.data.mustReset) {
        // Redirect to reset password flow, pass email so the reset page can prefill
        navigate('/reset-password', { state: { email } })
      } else {
        setError('Invalid response')
      }
    } catch (err) {
      // safe narrowing for potential axios error shape
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as Record<string, unknown>)['response'] as Record<string, unknown> | undefined
        const data = resp && typeof resp === 'object' ? (resp['data'] as Record<string, unknown> | undefined) : undefined
        const msg = data && typeof data === 'object' && data['error'] ? String(data['error']) : 'Login failed'
        setError(msg)
      } else {
        setError('Login failed')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6 rounded-lg shadow-lg bg-card">
        <h2 className="text-2xl font-bold mb-4">Sign in</h2>
        {error && <div className="text-sm text-red-500 mb-2">{error}</div>}
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="Enter your email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              type="password" 
              placeholder="Enter your password"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
            />
          </div>
          <Button onClick={handleLogin} className="w-full">Sign in</Button>
        </div>
      </div>
    </div>
  )
}
