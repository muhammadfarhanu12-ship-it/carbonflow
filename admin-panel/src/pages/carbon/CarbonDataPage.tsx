import { useEffect, useState } from 'react';
import { Search, Filter, Download, Upload, Database } from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { CarbonDataRecord, PaginatedResponse, SupplierBenchmarkRecord } from '../../types/admin';

export function CarbonDataPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [recordsResponse, setRecordsResponse] = useState<PaginatedResponse<CarbonDataRecord> | null>(null);
  const [benchmarkResponse, setBenchmarkResponse] = useState<PaginatedResponse<SupplierBenchmarkRecord> | null>(null);
  const [benchmarkSearch, setBenchmarkSearch] = useState('');
  const [benchmarkSourceYear, setBenchmarkSourceYear] = useState('');
  const [benchmarkMessage, setBenchmarkMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError('');

      adminService.getCarbonData({ search: searchTerm, page, pageSize: 10 })
        .then((response) => {
          setRecordsResponse(response);
        })
        .catch((err: Error) => {
          setError(err.message || 'Failed to load carbon data');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [page, searchTerm]);

  const loadBenchmarks = () => {
    setIsBenchmarkLoading(true);
    adminService.getSupplierBenchmarks({ search: benchmarkSearch, sourceYear: benchmarkSourceYear, page: 1, pageSize: 10 })
      .then(setBenchmarkResponse)
      .catch((err: Error) => setError(err.message || 'Failed to load supplier benchmarks'))
      .finally(() => setIsBenchmarkLoading(false));
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(loadBenchmarks, 300);
    return () => window.clearTimeout(timeoutId);
  }, [benchmarkSearch, benchmarkSourceYear]);

  const records = recordsResponse?.data || [];
  const pagination = recordsResponse?.pagination;

  const handleExport = () => {
    if (records.length === 0) {
      return;
    }

    const rows = [
      ['Record ID', 'Company', 'Category', 'Emissions (tons)', 'Submitted', 'Status'],
      ...records.map((record) => [
        record.recordId,
        record.companyName,
        record.category,
        String(record.emissionsTonnes),
        new Date(record.dateSubmitted).toISOString(),
        record.status,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'carbon-data.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBenchmarkCsvUpload = async (file: File | null) => {
    if (!file) return;
    try {
      setBenchmarkMessage('');
      const csv = await file.text();
      const result = await adminService.uploadSupplierBenchmarkCsv(csv);
      setBenchmarkMessage(`Uploaded ${result.created} supplier benchmark row${result.created === 1 ? '' : 's'}.`);
      loadBenchmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload supplier benchmark CSV');
    }
  };

  const deactivateBenchmark = async (id: string) => {
    try {
      await adminService.deactivateSupplierBenchmark(id);
      setBenchmarkMessage('Benchmark dataset deactivated.');
      loadBenchmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate supplier benchmark');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Carbon Data Ledger</h1>
          <p className="text-sm text-gray-500 mt-1">Review and manage all submitted carbon footprint records.</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm w-full sm:w-auto justify-center disabled:opacity-50"
          onClick={handleExport}
          disabled={records.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
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
              placeholder="Search records by ID or company..."
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
            {pagination ? `${pagination.total} records` : 'Filter'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Record ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User / Company</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Emissions (CO2e)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Submitted</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                    {row.recordId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.companyName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                    {row.emissionsTonnes.toFixed(2)} tons
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(row.dateSubmitted).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      row.status === 'Verified'
                        ? 'bg-green-100 text-green-800'
                        : row.status === 'Pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No carbon ledger records matched your search.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading carbon ledger...
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row gap-4 justify-between lg:items-center bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-green-700" />
              <h2 className="text-lg font-semibold text-gray-900">Supplier Benchmark Datasets</h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">Manage uploaded supplier intensity benchmarks used before internal fallback.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Search source/category"
              value={benchmarkSearch}
              onChange={(event) => setBenchmarkSearch(event.target.value)}
            />
            <input
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Year"
              value={benchmarkSourceYear}
              onChange={(event) => setBenchmarkSourceYear(event.target.value)}
            />
            <label className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 cursor-pointer">
              <Upload className="h-4 w-4" />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  void handleBenchmarkCsvUpload(event.target.files?.[0] ?? null);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>
        {benchmarkMessage ? (
          <div className="mx-4 mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{benchmarkMessage}</div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Region</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Avg intensity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(benchmarkResponse?.data || []).map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.category}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.region}{row.country ? ` / ${row.country}` : ''}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.averageIntensity.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.sourceName} {row.sourceYear}
                    <div className="text-xs text-gray-400">{row.isOfficial ? 'Official' : row.isSample ? 'Sample' : 'Configured'} · {row.version}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      className="text-sm font-medium text-red-600 disabled:text-gray-300"
                      disabled={!row.isActive}
                      onClick={() => void deactivateBenchmark(row.id)}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
              {!isBenchmarkLoading && (benchmarkResponse?.data || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No supplier benchmark datasets matched your filters.
                  </td>
                </tr>
              ) : null}
              {isBenchmarkLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading supplier benchmarks...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
