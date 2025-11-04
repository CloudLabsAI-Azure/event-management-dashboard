import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLocation, useNavigate } from 'react-router-dom'

export default function ResetPasswordPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const state = (loc.state || {}) as { email?: string }
  const [email, setEmail] = useState(state.email || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  const handleReset = async () => {
    setError('')
    try {
      const res = await api.post('/api/reset-password', { email, oldPassword, newPassword })
      if (res.data && res.data.token) {
        localStorage.setItem('dashboard_token', res.data.token)
        if (res.data.role) localStorage.setItem('dashboard_role', String(res.data.role))
        window.location.href = '/'
      } else {
        setError('Reset failed')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as Record<string, unknown>)['response'] as Record<string, unknown> | undefined
        const data = resp && typeof resp === 'object' ? (resp['data'] as Record<string, unknown> | undefined) : undefined
        const msg = data && typeof data === 'object' && data['error'] ? String(data['error']) : 'Reset failed'
        setError(msg)
      } else {
        setError('Reset failed')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6 rounded-lg shadow-lg bg-card">
        <h2 className="text-2xl font-bold mb-4">Reset Password</h2>
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
            <Label htmlFor="oldPassword">Temporary Password</Label>
            <Input 
              id="oldPassword" 
              type="password" 
              placeholder="Enter your temporary password"
              value={oldPassword} 
              onChange={(e) => setOldPassword(e.target.value)} 
            />
          </div>
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input 
              id="newPassword" 
              type="password" 
              placeholder="Enter your new password"
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
            />
          </div>
          <Button onClick={handleReset} className="w-full">Reset Password</Button>
        </div>
      </div>
    </div>
  )
}
