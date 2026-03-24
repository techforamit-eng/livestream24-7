'use client'
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users as UsersIcon, UserPlus, Key, Trash2, KeyRound, Save, X, Edit2, ShieldCheck, AlertCircle, LogIn } from 'lucide-react';

interface User {
  id: string;
  username: string;
}

export default function UserManagePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [newUserId, setNewUserId] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setCurrentUserId(data.currentUserId || '');
      }
    } catch (err) {
      setErrorMsg('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingUser(null);
    setNewUserId('');
    setNewUsername('');
    setNewPassword('');
  };

  const startEdit = (user: User) => {
    setIsCreating(false);
    setEditingUser(user);
    setNewUserId(user.id);
    setNewUsername(user.username);
    setNewPassword(''); // Requires new password to save
  };

  const cancelModal = () => {
    setIsCreating(false);
    setEditingUser(null);
    setErrorMsg('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating && (!newUserId || !newUsername || !newPassword)) {
      showError('All fields (ID, Username, Password) are required for new users.');
      return;
    }
    if (!isCreating && (!newUsername)) {
      showError('Username is required.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isCreating ? newUserId : editingUser?.id,
          username: newUsername,
          newPassword
        })
      });

      const data = await res.json();
      if (data.success) {
        showSuccess(data.message);
        cancelModal();
        fetchUsers();
      } else {
        showError(data.message || 'Failed to save user');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (id === currentUserId) {
      showError("You cannot delete your own account.");
      return;
    }
    if (id === 'admin') {
      showError("The main admin account cannot be deleted.");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete the user "${username}" (ID: ${id})?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(data.message);
        fetchUsers();
      } else {
        showError(data.message || 'Failed to delete');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const impersonateUser = async (user: User) => {
    if (!confirm(`Are you sure you want to login directly as "${user.username}"?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: user.id })
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(`Switched to ${user.username}... Refreshing.`);
        setTimeout(() => window.location.href = '/dashboard', 1000);
      } else {
        showError(data.message || 'Failed to switch user');
        setActionLoading(false);
      }
    } catch {
      showError('Network error');
      setActionLoading(false);
    }
  };

  const InputLabel = ({ children, icon: Icon }: any) => (
    <label className="flex items-center space-x-2 text-sm font-medium text-gray-400 mb-2">
      <Icon className="w-4 h-4 text-red-500" />
      <span>{children}</span>
    </label>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">User Management</h2>
          <p className="text-gray-500 text-sm mt-1">Manage platform access, reset passwords, and assign dedicated workspaces.</p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all font-semibold"
        >
          <UserPlus className="w-5 h-5" />
          <span>New User</span>
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 p-8">Loading users...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {users.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#161616] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group"
              >
                {/* Visual indicators */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-900 opacity-50" />
                {u.id === currentUserId && (
                  <div className="absolute top-4 right-4 text-green-500 text-xs font-bold px-2 py-0.5 bg-green-500/10 rounded-full flex items-center shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                    <ShieldCheck className="w-3 h-3 mr-1" /> ACTIVE
                  </div>
                )}

                <div className="flex items-start space-x-4 mb-6 mt-2">
                  <div className="w-12 h-12 bg-gray-900 border border-gray-800 rounded-full flex items-center justify-center shrink-0">
                    <UsersIcon className="w-6 h-6 text-red-500" />
                  </div>
                  <div className="min-w-0 pr-12">
                    <h3 className="text-lg font-bold text-white truncate">{u.username}</h3>
                    <p className="text-sm text-gray-500 font-mono truncate">ID: {u.id}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => startEdit(u)}
                    className="flex-1 flex justify-center items-center space-x-2 py-2 bg-[#1a1a1a] border border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-gray-400 hover:text-blue-400 rounded-xl transition-all text-sm font-semibold"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Manage / Password</span>
                  </button>
                  {u.id !== 'admin' && u.id !== currentUserId && (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      disabled={actionLoading}
                      className="p-2 border border-gray-800 bg-[#1a1a1a] hover:bg-red-500/10 hover:border-red-500/50 text-gray-400 hover:text-red-500 rounded-xl transition-all"
                      title="Delete User"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  {currentUserId === 'admin' && u.id !== 'admin' && (
                    <button
                      onClick={() => impersonateUser(u)}
                      disabled={actionLoading}
                      className="p-2 border border-green-800 bg-[#1a1a1a] hover:bg-green-500/10 hover:border-green-500/50 text-gray-400 hover:text-green-500 rounded-xl transition-all"
                      title="Login as User (Impersonate)"
                    >
                      <LogIn className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Unified User Modal */}
      {(isCreating || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#161616] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 bg-[#111]">
              <h3 className="text-xl font-bold text-white flex items-center">
                {isCreating ? <UserPlus className="w-5 h-5 mr-3 text-red-500" /> : <Edit2 className="w-5 h-5 mr-3 text-blue-500" />}
                {isCreating ? 'Create New User' : `Edit User: ${editingUser?.username}`}
              </h3>
              <button onClick={cancelModal} className="text-gray-500 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-5">
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl text-sm flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" /> {errorMsg}
                </div>
              )}

              <div>
                <InputLabel icon={Key}>User ID (Role Handle)</InputLabel>
                <input
                  type="text"
                  placeholder="e.g. editor1, tech_team"
                  value={newUserId}
                  onChange={e => setNewUserId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  disabled={!isCreating}
                  className="w-full bg-[#1a1a1a] text-white px-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 outline-none disabled:opacity-50 transition-all font-mono text-sm"
                />
                {isCreating && <p className="text-xs text-gray-600 mt-2">Cannot be changed later. Used for internal directories.</p>}
              </div>

              <div>
                <InputLabel icon={UsersIcon}>Display/Username</InputLabel>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white px-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <InputLabel icon={KeyRound}>{isCreating ? 'Password' : 'New Password'}</InputLabel>
                <input
                  type="password"
                  placeholder={isCreating ? "Set initial password" : "Enter to reset password (leave blank to keep current)"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white px-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 outline-none transition-all placeholder:text-gray-700 text-sm"
                />
              </div>

              <div className="pt-4 border-t border-gray-800 flex justify-end space-x-3">
                <button type="button" onClick={cancelModal} className="px-5 py-2.5 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !newUserId || !newUsername || (isCreating && !newPassword)}
                  className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                >
                  <Save className="w-4 h-4" />
                  <span>{isCreating ? 'Create Account' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Absolute success toaster */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-10 left-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl font-semibold flex items-center z-50 text-sm"
          >
            <ShieldCheck className="w-5 h-5 mr-2" />
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
