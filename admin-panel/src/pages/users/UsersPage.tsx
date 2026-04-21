import { useEffect, useState } from 'react';
import { Search, Filter, Ban, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { AdminUserRecord, PaginatedResponse } from '../../types/admin';

function formatStatus(status: AdminUserRecord['status']) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [usersResponse, setUsersResponse] = useState<PaginatedResponse<AdminUserRecord> | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError('');

      adminService.getUsers({ search: searchTerm, page, pageSize: 10 })
        .then((response) => {
          setUsersResponse(response);
        })
        .catch((err: Error) => {
          setError(err.message || 'Failed to load users');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [page, searchTerm]);

  const users = usersResponse?.data || [];
  const pagination = usersResponse?.pagination;

  const handleToggleStatus = async (user: AdminUserRecord) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    setBusyUserId(user.id);
    try {
      await adminService.updateUserStatus(user.id, nextStatus);
      const refreshed = await adminService.getUsers({ search: searchTerm, page, pageSize: 10 });
      setUsersResponse(refreshed);
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDelete = async (user: AdminUserRecord) => {
    const confirmed = window.confirm(`Delete ${user.email}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setBusyUserId(user.id);
    try {
      await adminService.deleteUser(user.id);
      const nextPage = users.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage);
      const refreshed = await adminService.getUsers({ search: searchTerm, page: nextPage, pageSize: 10 });
      setUsersResponse(refreshed);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage platform users, roles, and access.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
              <input
                type="text"
                placeholder="Search users..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors w-full sm:w-auto justify-center">
            <Filter className="h-4 w-4" />
            {pagination ? `${pagination.total} users` : 'Filter'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company / User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined Date</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold border border-green-200">
                        {user.name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        <div className="text-xs text-gray-400">{user.company?.name || 'No company assigned'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {formatStatus(user.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.company?.planType || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="text-gray-400 hover:text-orange-600 transition-colors disabled:opacity-50"
                        title={user.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        onClick={() => handleToggleStatus(user)}
                        disabled={busyUserId === user.id}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Delete"
                        onClick={() => handleDelete(user)}
                        disabled={busyUserId === user.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    No users matched your search.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading users...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page <span className="font-medium">{pagination?.page || 1}</span> of <span className="font-medium">{pagination?.totalPages || 1}</span>
                {' '}with <span className="font-medium">{pagination?.total || 0}</span> total results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={!pagination || pagination.page <= 1 || isLoading}
                >
                  Previous
                </button>
                <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-green-50 text-sm font-medium text-green-600">
                  {pagination?.page || 1}
                </button>
                <button
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!pagination || pagination.page >= pagination.totalPages || isLoading}
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
