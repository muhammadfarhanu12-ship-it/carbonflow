import { FormEvent, useMemo, useState } from 'react';
import { Archive, Eye, Pause, Save, Send, UploadCloud } from 'lucide-react';
import { adminService, type AdminMarketplaceListing, type AdminMarketplaceListingPayload, type AdminMarketplaceTransaction } from '../../services/adminService';

type RunAction = (action: () => Promise<unknown>, success: string) => Promise<void>;

const currentYear = new Date().getUTCFullYear();

const emptyListing: AdminMarketplaceListingPayload = {
  projectName: '',
  projectDescription: '',
  projectType: 'Forestry',
  category: 'Forestry',
  methodology: '',
  registryName: '',
  registryProjectId: '',
  registryUrl: '',
  country: '',
  region: '',
  vintageYear: currentYear,
  creditUnit: 'tCO2e',
  totalQuantityTco2e: 0,
  availableQuantityTco2e: 0,
  pricePerTco2e: 0,
  currency: 'USD',
  verificationStatus: 'UNVERIFIED',
  status: 'DRAFT',
  isDemo: false,
  isSample: false,
  isRealInventory: false,
  evidenceDocuments: [{ name: '', url: '', type: 'evidence' }],
  notes: '',
};

function listingToPayload(listing: AdminMarketplaceListing): AdminMarketplaceListingPayload {
  return {
    projectName: listing.projectName || listing.name || '',
    projectDescription: listing.projectDescription || listing.description || '',
    projectType: listing.projectType || listing.category || listing.type || 'Forestry',
    category: listing.category || listing.type || 'Forestry',
    methodology: listing.methodology || '',
    registryName: listing.registryName || listing.registry || '',
    registryProjectId: listing.registryProjectId || '',
    registryUrl: listing.registryUrl || '',
    country: listing.country || '',
    region: listing.region || '',
    vintageYear: Number(listing.vintageYear || currentYear),
    creditUnit: listing.creditUnit || 'tCO2e',
    totalQuantityTco2e: Number(listing.totalQuantityTco2e || listing.availableCredits || 0),
    availableQuantityTco2e: Number(listing.availableQuantityTco2e ?? listing.availableCredits ?? 0),
    pricePerTco2e: Number(listing.pricePerTco2e ?? listing.pricePerCreditUsd ?? 0),
    currency: listing.currency || 'USD',
    verificationStatus: listing.verificationStatus || 'UNVERIFIED',
    status: listing.status || 'DRAFT',
    isDemo: Boolean(listing.isDemo),
    isSample: Boolean(listing.isSample),
    isRealInventory: Boolean(listing.isRealInventory),
    evidenceDocuments: listing.evidenceDocuments?.length ? listing.evidenceDocuments : [{ name: '', url: '', type: 'evidence' }],
    notes: listing.notes || '',
  };
}

function validateListing(payload: AdminMarketplaceListingPayload) {
  if (!payload.projectName.trim()) return 'Project name is required.';
  if (Number(payload.totalQuantityTco2e) <= 0) return 'Total quantity must be greater than zero.';
  if (Number(payload.availableQuantityTco2e) < 0) return 'Available inventory cannot be negative.';
  if (Number(payload.availableQuantityTco2e) > Number(payload.totalQuantityTco2e)) return 'Available inventory cannot exceed total inventory.';
  if (Number(payload.pricePerTco2e) < 0) return 'Price must be zero or greater.';
  if (Number(payload.vintageYear) < 1990 || Number(payload.vintageYear) > currentYear + 5) return 'Vintage year is outside the valid range.';
  if ((payload.isDemo || payload.isSample) && payload.isRealInventory) return 'Demo listings cannot be marked as real inventory.';
  if (payload.status === 'PUBLISHED' && payload.isRealInventory) {
    const hasEvidence = payload.evidenceDocuments.some((item) => item.url.trim());
    if (!payload.registryName?.trim() || !payload.registryProjectId?.trim() || !payload.registryUrl?.trim() || !hasEvidence) {
      return 'Registry name, project ID, registry URL, and evidence metadata are required before publishing real inventory.';
    }
  }
  return '';
}

export function ListingLifecyclePanel({
  companyId,
  listings,
  runAction,
}: {
  companyId: string;
  listings: AdminMarketplaceListing[];
  runAction: RunAction;
}) {
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<AdminMarketplaceListingPayload>(emptyListing);
  const [validation, setValidation] = useState('');

  function startEdit(listing: AdminMarketplaceListing) {
    setEditingId(listing.id);
    setForm(listingToPayload(listing));
    setValidation('');
  }

  function update<K extends keyof AdminMarketplaceListingPayload>(key: K, value: AdminMarketplaceListingPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setStatus(status: string) {
    setForm((current) => ({ ...current, status }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateListing(form);
    setValidation(error);
    if (error) return;

    await runAction(
      () => editingId
        ? adminService.updateMarketplaceListing(companyId, editingId, form)
        : adminService.createMarketplaceListing(companyId, form),
      editingId ? 'Listing updated.' : 'Listing draft saved.',
    );
    setEditingId('');
    setForm(emptyListing);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="font-semibold text-gray-900">Listings: Create, Edit, Review, Publish</h2>
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1.25fr]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr><th className="px-3 py-2">Listing</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Inventory</th><th className="px-3 py-2">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{listing.name}</div>
                    <div className="text-xs text-gray-500">{listing.isDemo ? 'Demo' : listing.isRealInventory ? 'Real inventory' : 'Not marked real'}</div>
                  </td>
                  <td className="px-3 py-2">{listing.status}</td>
                  <td className="px-3 py-2">{Number(listing.availableCredits || 0).toLocaleString()} / {Number(listing.totalQuantityTco2e || 0).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button className="rounded-md border border-gray-300 px-2 py-1" type="button" onClick={() => startEdit(listing)}>Edit</button>
                  </td>
                </tr>
              ))}
              {listings.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No listings yet.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          {validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Project Name" value={form.projectName} onChange={(value) => update('projectName', value)} />
            <Field label="Category / Type" value={form.category} onChange={(value) => { update('category', value); update('projectType', value); }} />
            <Field label="Methodology" value={form.methodology || ''} onChange={(value) => update('methodology', value)} />
            <Field label="Registry Name" value={form.registryName || ''} onChange={(value) => update('registryName', value)} />
            <Field label="Registry Project ID" value={form.registryProjectId || ''} onChange={(value) => update('registryProjectId', value)} />
            <Field label="Registry URL" value={form.registryUrl || ''} onChange={(value) => update('registryUrl', value)} />
            <Field label="Country" value={form.country || ''} onChange={(value) => update('country', value)} />
            <Field label="Region" value={form.region || ''} onChange={(value) => update('region', value)} />
            <NumberField label="Vintage Year" value={form.vintageYear} onChange={(value) => update('vintageYear', value)} />
            <Field label="Credit Unit" value={form.creditUnit || 'tCO2e'} onChange={(value) => update('creditUnit', value)} />
            <NumberField label="Total Quantity tCO2e" value={form.totalQuantityTco2e} onChange={(value) => update('totalQuantityTco2e', value)} />
            <NumberField label="Available Quantity tCO2e" value={form.availableQuantityTco2e} onChange={(value) => update('availableQuantityTco2e', value)} />
            <NumberField label="Price per tCO2e" value={form.pricePerTco2e} onChange={(value) => update('pricePerTco2e', value)} />
            <Field label="Currency" value={form.currency} onChange={(value) => update('currency', value)} />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Description</span>
            <textarea className="min-h-20 rounded-md border border-gray-300 px-3 py-2" value={form.projectDescription || ''} onChange={(event) => update('projectDescription', event.target.value)} />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="Verification" value={form.verificationStatus} options={['UNVERIFIED', 'SELF_REPORTED', 'THIRD_PARTY_VERIFIED', 'REGISTRY_VERIFIED', 'REJECTED', 'EXPIRED']} onChange={(value) => update('verificationStatus', value)} />
            <Select label="Status" value={form.status} options={['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'ARCHIVED', 'SOLD_OUT']} onChange={setStatus} />
            <Field label="Evidence URL" value={form.evidenceDocuments[0]?.url || ''} onChange={(value) => update('evidenceDocuments', [{ name: form.evidenceDocuments[0]?.name || 'Evidence', url: value, type: 'evidence' }])} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Checkbox label="Demo" checked={form.isDemo} onChange={(checked) => update('isDemo', checked)} />
            <Checkbox label="Sample" checked={form.isSample} onChange={(checked) => update('isSample', checked)} />
            <Checkbox label="Real Inventory" checked={form.isRealInventory} onChange={(checked) => update('isRealInventory', checked)} />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Notes</span>
            <textarea className="min-h-16 rounded-md border border-gray-300 px-3 py-2" value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={Save} label="Save Draft" onClick={() => setStatus('DRAFT')} />
            <ActionButton icon={Send} label="Submit for Review" onClick={() => setStatus('PENDING_REVIEW')} />
            <ActionButton icon={UploadCloud} label="Publish" onClick={() => setStatus('PUBLISHED')} />
            <ActionButton icon={Pause} label="Pause" onClick={() => setStatus('PAUSED')} />
            <ActionButton icon={Archive} label="Archive" onClick={() => setStatus('ARCHIVED')} />
            <ActionButton icon={Eye} label="View Audit" type="button" onClick={() => window.alert('Open Audit Logs and filter by listing ID for full history.')} />
          </div>
        </form>
      </div>
    </section>
  );
}

export function InventoryPanel({ companyId, listings, runAction }: { companyId: string; listings: AdminMarketplaceListing[]; runAction: RunAction }) {
  const firstListing = listings[0];
  const [listingId, setListingId] = useState(firstListing?.id || '');
  const listing = useMemo(() => listings.find((item) => item.id === listingId) || firstListing, [firstListing, listingId, listings]);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState({
    totalQuantityTco2e: Number(listing?.totalQuantityTco2e || 0),
    availableQuantityTco2e: Number(listing?.availableQuantityTco2e ?? listing?.availableCredits ?? 0),
    reservedQuantityTco2e: Number(listing?.reservedQuantityTco2e ?? listing?.reservedCredits ?? 0),
    retiredQuantityTco2e: Number(listing?.retiredQuantityTco2e ?? listing?.retiredCredits ?? 0),
  });

  function syncSelection(nextId: string) {
    const next = listings.find((item) => item.id === nextId);
    setListingId(nextId);
    setValues({
      totalQuantityTco2e: Number(next?.totalQuantityTco2e || 0),
      availableQuantityTco2e: Number(next?.availableQuantityTco2e ?? next?.availableCredits ?? 0),
      reservedQuantityTco2e: Number(next?.reservedQuantityTco2e ?? next?.reservedCredits ?? 0),
      retiredQuantityTco2e: Number(next?.retiredQuantityTco2e ?? next?.retiredCredits ?? 0),
    });
  }

  const lowInventory = Number(values.availableQuantityTco2e || 0) > 0 && Number(values.availableQuantityTco2e || 0) <= 10;
  const soldOut = Number(values.availableQuantityTco2e || 0) === 0;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="font-semibold text-gray-900">Inventory Management</h2>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
        <Select label="Listing" value={listing?.id || ''} options={listings.map((item) => item.id)} optionLabels={Object.fromEntries(listings.map((item) => [item.id, item.name]))} onChange={syncSelection} />
        <NumberField label="Total" value={values.totalQuantityTco2e} onChange={(value) => setValues((current) => ({ ...current, totalQuantityTco2e: value }))} />
        <NumberField label="Available" value={values.availableQuantityTco2e} onChange={(value) => setValues((current) => ({ ...current, availableQuantityTco2e: value }))} />
        <NumberField label="Reserved" value={values.reservedQuantityTco2e} onChange={(value) => setValues((current) => ({ ...current, reservedQuantityTco2e: value }))} />
        <NumberField label="Retired" value={values.retiredQuantityTco2e} onChange={(value) => setValues((current) => ({ ...current, retiredQuantityTco2e: value }))} />
      </div>
      <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
        <Field label="Adjustment Reason" value={reason} onChange={setReason} />
        <button
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!listing || !reason.trim()}
          onClick={() => listing && runAction(() => adminService.adjustMarketplaceInventory(companyId, listing.id, { ...values, reason }), 'Inventory adjusted and audited.')}
        >
          Save Adjustment
        </button>
        {lowInventory ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Low inventory warning</span> : null}
        {soldOut ? <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Sold out</span> : null}
      </div>
    </section>
  );
}

export function SettlementAndRetirementPanel({ companyId, transactions, runAction }: { companyId: string; transactions: AdminMarketplaceTransaction[]; runAction: RunAction }) {
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentReason, setPaymentReason] = useState('');
  const [retirementReference, setRetirementReference] = useState('');
  const [retirementUrl, setRetirementUrl] = useState('');
  const [retirementDate, setRetirementDate] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="font-semibold text-gray-900">Payment, Registry Retirements, Certificates, Evidence</h2>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-3">
        <Field label="Payment Reference / Invoice Number" value={paymentReference} onChange={setPaymentReference} />
        <Field label="Payment Notes / Failure Reason" value={paymentReason} onChange={setPaymentReason} />
        <Field label="Retirement Reference" value={retirementReference} onChange={setRetirementReference} />
        <Field label="Registry Retirement URL" value={retirementUrl} onChange={setRetirementUrl} />
        <Field label="Retirement Date" type="date" value={retirementDate} onChange={setRetirementDate} />
        <Field label="Evidence URL" value={evidenceUrl} onChange={setEvidenceUrl} />
      </div>
      <div className="px-5 pb-5">
        <Field label="Verification Notes" value={notes} onChange={setNotes} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr><th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Registry</th><th className="px-5 py-3">Certificate Type</th><th className="px-5 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((transaction) => {
              const id = String(transaction.id || transaction._id || '');
              const certificateType = transaction.isDemo
                ? 'Demo Certificate - Not valid for real offset claims.'
                : transaction.registryRetirementStatus === 'manually_verified'
                  ? 'Registry retirement manually verified by admin.'
                  : 'Internal transaction record only — no registry retirement completed.';
              return (
                <tr key={id}>
                  <td className="px-5 py-3"><div className="font-medium">{transaction.projectName || 'Project'}</div><div className="text-xs text-gray-500">{transaction.lifecycleStatus || transaction.status}</div></td>
                  <td className="px-5 py-3">{transaction.paymentStatus || 'pending'}</td>
                  <td className="px-5 py-3">{transaction.registryRetirementStatus || 'pending'}</td>
                  <td className="px-5 py-3 text-xs">{certificateType}</td>
                  <td className="space-x-2 px-5 py-3">
                    <button className="rounded-md border border-gray-300 px-2 py-1" onClick={() => runAction(() => adminService.createMarketplaceInvoice(companyId, id), 'Invoice sent for manual verification.')}>Invoice</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50" disabled={!paymentReference.trim()} onClick={() => runAction(() => adminService.markMarketplacePaid(companyId, id, paymentReference.trim(), paymentReason || 'Manually verified by admin'), 'Payment marked paid.')}>Paid</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50" disabled={!paymentReason.trim()} onClick={() => runAction(() => adminService.markMarketplacePaymentFailed(companyId, id, paymentReason), 'Payment marked failed.')}>Failed</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50" disabled={!paymentReason.trim()} onClick={() => runAction(() => adminService.cancelMarketplacePayment(companyId, id, paymentReason), 'Payment cancelled.')}>Cancel</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50" disabled={!paymentReason.trim()} onClick={() => runAction(() => adminService.refundMarketplacePayment(companyId, id, paymentReason), 'Payment refunded.')}>Refund</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1" onClick={() => runAction(() => adminService.submitMarketplaceRetirement(companyId, id), 'Retirement moved to provider/manual workflow.')}>Submit</button>
                    <button className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50" disabled={!retirementReference.trim() || (!evidenceUrl.trim() && !retirementUrl.trim()) || Boolean(transaction.isDemo)} onClick={() => runAction(() => adminService.manualMarketplaceRetirement(companyId, id, { registryRetirementId: retirementReference.trim(), registryRetirementUrl: retirementUrl.trim() || undefined, registryRetiredAt: retirementDate || undefined, verificationNotes: notes || 'Registry retirement manually verified by admin.', evidenceReferences: evidenceUrl.trim() ? [{ name: 'Manual registry evidence', url: evidenceUrl.trim() }] : [] }), 'Manual registry retirement verified.')}>Manual Verify</button>
                  </td>
                </tr>
              );
            })}
            {transactions.length === 0 ? <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-500">No transactions found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <input className="rounded-md border border-gray-300 px-3 py-2" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label} type="number" value={String(value)} onChange={(value) => onChange(Number(value))} />;
}

function Select({ label, value, options, optionLabels = {}, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <select className="rounded-md border border-gray-300 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{optionLabels[option] || option}</option>)}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ActionButton({ icon: Icon, label, onClick, type = 'submit' }: { icon: typeof Save; label: string; type?: 'button' | 'submit'; onClick?: () => void }) {
  return (
    <button type={type} className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50" onClick={onClick}>
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </button>
  );
}
