import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeDollarSign, ClipboardCheck, FileCheck2, PackageSearch, RefreshCw } from 'lucide-react';
import { adminService, type AdminMarketplaceOverview, type AdminMarketplaceTransaction } from '../../services/adminService';
import { InventoryPanel, ListingLifecyclePanel, SettlementAndRetirementPanel } from './MarketplaceAdminWorkflows';

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function getTransactionId(transaction: AdminMarketplaceTransaction) {
  return String(transaction.id || transaction._id || '');
}

export function MarketplacePage() {
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState<AdminMarketplaceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [manualReference, setManualReference] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const cards = data?.operations.cards || {};
  const transactions = data?.listings.transactions || [];
  const publishedListings = useMemo(
    () => (data?.listings.data || []).filter((listing) => listing.status === 'PUBLISHED'),
    [data],
  );
  const reviewItems = useMemo(() => {
    if (!data) return [];
    return [
      ...data.operations.queues.budgetRequests.map((item: any) => ({ type: 'Budget Request', priority: 'High', title: `${formatCurrency(item.requestedAmount)} requested`, status: item.status, owner: item.requestedBy || '-', createdAt: item.createdAt })),
      ...data.operations.queues.pendingPayment.map((item) => ({ type: 'Payment', priority: 'High', title: item.projectName || 'Marketplace transaction', status: item.paymentStatus || item.lifecycleStatus, owner: item.companyName || '-', createdAt: item.createdAt })),
      ...data.operations.queues.pendingRegistry.map((item) => ({ type: 'Registry Retirement', priority: 'High', title: item.projectName || 'Marketplace transaction', status: item.registryRetirementStatus || item.lifecycleStatus, owner: item.companyName || '-', createdAt: item.createdAt })),
      ...data.operations.queues.failedTransactions.map((item) => ({ type: 'Failed Transaction', priority: 'Critical', title: item.projectName || 'Marketplace transaction', status: item.status || item.lifecycleStatus, owner: item.companyName || '-', createdAt: item.createdAt })),
      ...data.operations.queues.missingRegistry.map((item: any) => ({ type: 'Listing Metadata', priority: 'Medium', title: item.name || item.projectName || 'Listing', status: item.status, owner: item.companyId || '-', createdAt: item.createdAt })),
      ...data.operations.queues.lowInventory.map((item: any) => ({ type: 'Low Inventory', priority: 'Medium', title: item.name || item.projectName || 'Listing', status: item.status, owner: item.companyId || '-', createdAt: item.updatedAt || item.createdAt })),
      ...data.operations.queues.soldOut.map((item: any) => ({ type: 'Sold Out', priority: 'Low', title: item.name || item.projectName || 'Listing', status: item.status, owner: item.companyId || '-', createdAt: item.updatedAt || item.createdAt })),
    ];
  }, [data]);

  async function loadMarketplace(nextCompanyId = companyId) {
    if (!nextCompanyId.trim()) {
      setError('Enter a companyId to review marketplace operations.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setActionMessage('');
      setData(await adminService.getMarketplace(nextCompanyId.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace operations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedCompanyId = localStorage.getItem('adminMarketplaceCompanyId') || '';
    if (storedCompanyId) {
      setCompanyId(storedCompanyId);
      void loadMarketplace(storedCompanyId);
    }
  }, []);

  function submitCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem('adminMarketplaceCompanyId', companyId.trim());
    void loadMarketplace();
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    try {
      setLoading(true);
      setError('');
      await action();
      setActionMessage(success);
      await loadMarketplace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Marketplace action failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace Management</h1>
          <p className="text-sm text-gray-600">Operational review for listings, inventory, transactions, payments, registry retirements, certificates, and budget approvals.</p>
        </div>
        <form onSubmit={submitCompany} className="flex gap-2">
          <input
            className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Company ID"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          />
          <button className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700" type="submit">
            <RefreshCw className="mr-2 h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {actionMessage ? <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{actionMessage}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ReviewCard title="Budget Approvals" value={cards.pendingBudgetApprovals} icon={ClipboardCheck} />
        <ReviewCard title="Payment Verification" value={cards.pendingPaymentVerification} icon={BadgeDollarSign} />
        <ReviewCard title="Registry Retirements" value={cards.pendingRegistryRetirements} icon={FileCheck2} />
        <ReviewCard title="Failed Transactions" value={cards.failedTransactions} icon={AlertTriangle} />
        <ReviewCard title="Low Inventory" value={cards.lowInventoryListings} icon={PackageSearch} />
        <ReviewCard title="Sold Out" value={cards.soldOutListings} icon={PackageSearch} />
      </div>

      {data ? (
        <>
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Budget Requests</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {data.budget.requests.length === 0 ? (
                <EmptyRow text="No budget requests for this company." />
              ) : data.budget.requests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{formatCurrency(request.requestedAmount)} requested</div>
                    <div className="text-gray-500">Current {formatCurrency(request.currentBudget)} • {request.status}</div>
                  </div>
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button className="rounded-md bg-green-600 px-3 py-1.5 text-white" onClick={() => runAction(() => adminService.approveMarketplaceBudgetRequest(companyId, request.id, 'Approved from admin marketplace queue'), 'Budget request approved.')}>Approve</button>
                      <button className="rounded-md border border-gray-300 px-3 py-1.5" onClick={() => runAction(() => adminService.rejectMarketplaceBudgetRequest(companyId, request.id, 'Rejected from admin marketplace queue'), 'Budget request rejected.')}>Reject</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <ListingLifecyclePanel
            companyId={companyId}
            listings={data.listings.data}
            runAction={runAction}
          />

          <InventoryPanel
            companyId={companyId}
            listings={data.listings.data}
            runAction={runAction}
          />

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Published Listings And Inventory</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Listing</th>
                    <th className="px-5 py-3">Registry</th>
                    <th className="px-5 py-3">Inventory</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {publishedListings.length === 0 ? (
                    <tr><td colSpan={5}><EmptyRow text="No published listings." /></td></tr>
                  ) : publishedListings.map((listing) => (
                    <tr key={listing.id}>
                      <td className="px-5 py-3 font-medium">{listing.name}</td>
                      <td className="px-5 py-3">{listing.registryName || 'Registry not provided'} / {listing.registryProjectId || 'Missing project ID'}</td>
                      <td className="px-5 py-3">{Number(listing.availableCredits || 0).toLocaleString()} tCO2e</td>
                      <td className="px-5 py-3">{formatCurrency(listing.pricePerCreditUsd)}/tCO2e</td>
                      <td className="px-5 py-3">{listing.isDemo ? 'Demo' : listing.isRealInventory ? 'Real inventory' : 'Not marked real'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Transactions Requiring Operations</h2>
            </div>
            <div className="space-y-3 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Manual registry retirement reference" value={manualReference} onChange={(event) => setManualReference(event.target.value)} />
                <input className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Manual payment reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Project</th>
                      <th className="px-5 py-3">Payment</th>
                      <th className="px-5 py-3">Registry</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5}><EmptyRow text="No marketplace transactions." /></td></tr>
                    ) : transactions.map((transaction) => {
                      const transactionId = getTransactionId(transaction);
                      return (
                        <tr key={transactionId}>
                          <td className="px-5 py-3">{transaction.projectName || 'Project'}</td>
                          <td className="px-5 py-3">{transaction.paymentStatus || 'pending'}</td>
                          <td className="px-5 py-3">{transaction.registryRetirementStatus || 'pending'}</td>
                          <td className="px-5 py-3">{formatCurrency(transaction.totalCostUsd)}</td>
                          <td className="space-x-2 px-5 py-3">
                            <button className="rounded-md border border-gray-300 px-2 py-1" onClick={() => runAction(() => adminService.createMarketplaceInvoice(companyId, transactionId), 'Invoice workflow updated.')}>Invoice</button>
                            <button className="rounded-md border border-gray-300 px-2 py-1" disabled={!paymentReference.trim()} onClick={() => runAction(() => adminService.markMarketplacePaid(companyId, transactionId, paymentReference.trim(), 'Verified in admin marketplace'), 'Payment marked paid.')}>Mark Paid</button>
                            <button className="rounded-md border border-gray-300 px-2 py-1" onClick={() => runAction(() => adminService.submitMarketplaceRetirement(companyId, transactionId), 'Registry retirement submitted or moved to manual verification.')}>Submit Retirement</button>
                            <button className="rounded-md border border-gray-300 px-2 py-1" disabled={!manualReference.trim()} onClick={() => runAction(() => adminService.manualMarketplaceRetirement(companyId, transactionId, { registryRetirementId: manualReference.trim(), verificationNotes: 'Verified in admin marketplace', evidenceReferences: [{ name: 'Manual verification', url: manualReference.trim() }] }), 'Manual registry retirement verified.')}>Manual Verify</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <SettlementAndRetirementPanel
            companyId={companyId}
            transactions={transactions}
            runAction={runAction}
          />

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Operational Review Queue</h2>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <ReviewCard title="Missing Registry Metadata" value={cards.listingsMissingRegistryMetadata} icon={AlertTriangle} />
              <ReviewCard title="Demo Listings" value={cards.demoListings} icon={PackageSearch} />
              <ReviewCard title="Real Inventory Listings" value={cards.realInventoryListings} icon={FileCheck2} />
              <ReviewCard title="Evidence Items" value={data.listings.data.reduce((sum, listing) => sum + (listing.evidenceDocuments?.length || 0), 0)} icon={ClipboardCheck} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr><th className="px-5 py-3">Item Type</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Title</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Owner/User</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviewItems.length === 0 ? (
                    <tr><td colSpan={7}><EmptyRow text="No operational review items." /></td></tr>
                  ) : reviewItems.map((item, index) => (
                    <tr key={`${item.type}-${index}`}>
                      <td className="px-5 py-3">{item.type}</td>
                      <td className="px-5 py-3">{item.priority}</td>
                      <td className="px-5 py-3">{item.title}</td>
                      <td className="px-5 py-3">{item.status || '-'}</td>
                      <td className="px-5 py-3">{item.owner}</td>
                      <td className="px-5 py-3">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</td>
                      <td className="px-5 py-3"><button className="rounded-md border border-gray-300 px-2 py-1" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Review</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Enter a companyId to load marketplace operations.
        </div>
      )}

      {loading ? <div className="text-sm text-gray-500">Loading marketplace operations...</div> : null}
    </div>
  );
}

function ReviewCard({ title, value = 0, icon: Icon }: { title: string; value?: number; icon: typeof ClipboardCheck }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <Icon className="h-5 w-5 text-green-600" />
      <div className="mt-3 text-2xl font-bold text-gray-900">{Number(value || 0)}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-6 text-center text-sm text-gray-500">{text}</div>;
}
