import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserPlus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"
import { useAuth } from '@/components/AuthProvider'
import { AccessDenied } from '@/components/AccessDenied'
import api from "@/lib/api"
import { useToast } from '@/hooks/use-toast'

interface User {
  id: string;
  name: string; // derived from email prefix
  email: string;
  role?: string;
}

export default function UsersPage() {
  const { userRole } = useAuth();
  const role = userRole; // maintain variable name for existing logic
  const [users, setUsers] = useState<User[]>([]);

  // Gate entire page: only admins may view
  if (role !== 'admin') {
    return <AccessDenied reason="Administrator access required" />
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/users');
        if (Array.isArray(res.data)) {
          setUsers(res.data.map((u: any) => ({ id: u.id, name: u.username || (u.email ? u.email.split('@')[0] : ''), email: u.email || '', role: u.role || 'user' })) as User[]);
        }
      } catch {}
    })();
  }, []);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", role: 'user' });
  const [csvError, setCsvError] = useState("");
  const { toast } = useToast()

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (role !== 'admin') return;
    try {
      await api.delete(`/api/users/${userId}`);
      setUsers(users.filter(user => user.id !== userId));
  toast({ title: 'User deleted' })
    } catch (err) {
      // ignore for now
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser || role !== 'admin') return;
    try {
      const payload: any = { username: editingUser.name || (editingUser.email ? editingUser.email.split('@')[0] : ''), email: editingUser.email, role: (editingUser as any).role || 'user' };
      const res = await api.put(`/api/users/${editingUser.id}`, payload);
      if (res.data && res.data.user) {
        const u = res.data.user;
        setUsers(users.map(user => user.id === editingUser.id ? { ...user, name: u.username || editingUser.name, email: u.email || editingUser.email, role: u.role || (editingUser as any).role } : user));
      } else {
        setUsers(users.map(user => user.id === editingUser.id ? editingUser : user));
      }
      setIsEditDialogOpen(false);
      setEditingUser(null);
    } catch {}
  };

  const handleAddUser = async () => {
    if (role !== 'admin') return;
    try {
      const username = newUser.email ? newUser.email.split('@')[0] : `user-${Date.now()}`;
      const payload: any = { username, email: newUser.email, role: (newUser as any).role || 'user' };
      const res = await api.post('/api/users', payload);
      if (res.data && res.data.user) {
        const created = res.data.user;
        const newUserWithId = { id: created.id, name: created.username || username, email: created.email || newUser.email || '', role: created.role || (newUser as any).role };
        setUsers([newUserWithId, ...users]);
      } else {
        const fetched = await api.get('/api/users');
        if (Array.isArray(fetched.data)) setUsers(fetched.data.map((u: any) => ({ id: u.id, name: u.username || (u.email ? u.email.split('@')[0] : ''), email: u.email || '', role: u.role || 'user' })) as User[]);
      }
    } catch {}
    setNewUser({ email: '', role: 'user' });
    setIsAddDialogOpen(false);
  };

  // bulk upload removed per request

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">User Management</h1>
            <p className="text-muted-foreground">
              Manage users, track engagement, and analyze user behavior
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                  <Button className="interactive-button" disabled={role !== 'admin'}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add New User
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Create a new user. SSO will handle authentication; only email & role required.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="add-email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="add-email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="add-role" className="text-right">Role</Label>
                    <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value})}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={handleAddUser}>
                    Add User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
      {/* bulk upload removed per request */}
          </div>
          {csvError && <div className="text-red-500 text-sm">{csvError}</div>}
        </div>
    {/* metrics removed */}

        {/* Recent Users */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>
              Manage users (SSO only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.email} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarFallback>{user.name ? user.name[0] : 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* Role */}
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                    {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                      {/* Edit Button with Dialog */}
                      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                          <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            disabled={role !== 'admin'}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Edit User</DialogTitle>
                            <DialogDescription>
                              Make changes to the user account here. Click save when you're done.
                            </DialogDescription>
                          </DialogHeader>
                          {editingUser && (
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-name" className="text-right">
                                  Name
                                </Label>
                                <Input
                                  id="edit-name"
                                  value={editingUser.name}
                                  onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-email" className="text-right">
                                  Email
                                </Label>
                                <Input
                                  id="edit-email"
                                  type="email"
                                  value={editingUser.email}
                                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="edit-role" className="text-right">Role</Label>
                                <Select value={(editingUser as any).role || 'user'} onValueChange={(value) => setEditingUser({...editingUser, role: value})}>
                                  <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                          <DialogFooter>
                            <Button type="submit" onClick={handleSaveEdit}>
                              Save changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      
                      {/* Delete Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-destructive hover:text-destructive"
                        disabled={role !== 'admin'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Temporary password logic removed for SSO-only flow */}
      </div>
    </DashboardLayout>
  )
}