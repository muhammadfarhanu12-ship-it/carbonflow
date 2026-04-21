import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  FileDown,
  Globe,
  Leaf,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import {
  MarketplaceFilters,
  type MarketplaceCategoryFilter,
  type MarketplaceSortFilter,
} from "@/src/components/MarketplaceFilters";
import {
  ProjectManagementModal,
  type ProjectManagementFormValues,
} from "@/src/components/marketplace/ProjectManagementModal";
import { Modal } from "@/src/components/shared/Modal";
import { ConfirmationModal } from "@/src/components/ConfirmationModal";
import { CheckoutDetails } from "@/src/components/CheckoutDetails";
import { MarketplaceCard } from "@/src/components/MarketplaceCard";
import { CarbonBudgetWidget } from "@/src/components/marketplace/CarbonBudgetWidget";
import { MarketplaceEmptyState } from "@/src/components/marketplace/MarketplaceEmptyState";
import { ProjectDetailsModal } from "@/src/components/marketplace/ProjectDetailsModal";
import { useToast } from "@/src/components/providers/ToastProvider";
import { CheckoutSummary } from "@/src/components/CheckoutSummary";
import { TransactionStatus, type CheckoutFlowState } from "@/src/components/TransactionStatus";
import { useCheckoutValidation } from "@/src/hooks/useCheckoutValidation";
import { authService } from "@/src/services/authService";
import { creditsService } from "@/src/services/creditsService";
import { marketplaceService, type ProjectPayload } from "@/src/services/marketplaceService";
import { socketService } from "@/src/services/socketService";
import type {
  CarbonCreditTransaction,
  CarbonProject,
  MarketplaceListingStatus,
} from "@/src/types/platform";
import { cn } from "@/src/utils/cn";

const MANAGEABLE_ROLES = new Set(["ADMIN", "SUPERADMIN", "MANAGER"]);

const lifecycleFilters: Array<{ label: string; value: "ALL" | MarketplaceListingStatus }> = [
  { label: "All Listings", value: "ALL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Sold Out", value: "SOLD_OUT" },
];

const initialCheckoutForm = {
  companyName: "",
  quantity: 100,
  shipmentId: null as string | null,
};

function getProjectAvailableInventory(project: CarbonProject | null) {
  if (!project) {
    return 0;
  }

  return Math.max(project.availableToPurchase ?? project.availableCredits, 0);
}

function mapProjectToForm(project: CarbonProject): ProjectManagementFormValues {
  const registry = project.registry || project.verificationStandard || project.certification;
  const category = ["Renewable Energy", "Blue Carbon", "Methane"].includes(project.type)
    ? project.type as ProjectManagementFormValues["category"]
    : "Forestry";

  return {
    projectName: project.name,
    category,
    registry: registry === "Verra" ? "Verra" : "Gold Standard",
    description: project.description || "",
    location: project.location || "",
    latitude: project.coordinates?.latitude ?? "",
    longitude: project.coordinates?.longitude ?? "",
    status: project.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
    pddDocuments: project.pddDocuments?.length ? project.pddDocuments : [{ name: "", url: "" }],
    vintageYear: project.vintageYear || new Date().getFullYear(),
    totalSupply: project.availableCredits,
    price: project.pricePerTonUsd ?? project.pricePerCreditUsd,
  };
}

function buildProjectPayload(formValues: ProjectManagementFormValues): ProjectPayload {
  const nextStatus = formValues.status === "DRAFT"
    ? "DRAFT"
    : formValues.totalSupply > 0
      ? "PUBLISHED"
      : "SOLD_OUT";

  return {
    name: formValues.projectName.trim(),
    type: formValues.category,
    location: formValues.location.trim(),
    description: formValues.description.trim() || null,
    coordinates: {
      latitude: formValues.latitude === "" ? null : formValues.latitude,
      longitude: formValues.longitude === "" ? null : formValues.longitude,
    },
    pddDocuments: formValues.pddDocuments
      .map((document) => ({
        name: document.name.trim() || "Project Design Document",
        url: document.url.trim(),
      }))
      .filter((document) => document.url),
    certification: formValues.registry,
    registry: formValues.registry,
    verificationStandard: formValues.registry,
    vintageYear: formValues.vintageYear,
    rating: 4.8,
    pricePerCreditUsd: formValues.price,
    pricePerTonUsd: formValues.price,
    availableCredits: formValues.totalSupply,
    status: nextStatus,
  };
}

function resolveTransactionReference(transaction: CarbonCreditTransaction) {
  return transaction.registryRecordId
    || transaction.blockchainHash
    || transaction.serialNumber
    || (transaction.status === "COMPLETED" ? "Recorded" : "Pending");
}

export function MarketplacePage() {
  const { showToast } = useToast();
  const sessionUser = authService.getSession().user;
  const canManageListings = MANAGEABLE_ROLES.has(sessionUser?.role || "");
  const [projects, setProjects] = useState<CarbonProject[]>([]);
  const [transactions, setTransactions] = useState<CarbonCreditTransaction[]>([]);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [detailsProjectId, setDetailsProjectId] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [activeTransaction, setActiveTransaction] = useState<CarbonCreditTransaction | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutFlowState>("IDLE");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MarketplaceListingStatus>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MarketplaceCategoryFilter>("ALL");
  const [sortFilter, setSortFilter] = useState<MarketplaceSortFilter>("latest");
  const [loading, setLoading] = useState(true);
  const [savingProject, setSavingProject] = useState(false);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [downloadingCertificate, setDownloadingCertificate] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ type: "archive" | "delete"; project: CarbonProject } | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  const editingProject = useMemo(
    () => projects.find((project) => project.id === editingProjectId) ?? null,
    [projects, editingProjectId],
  );

  const detailsProject = useMemo(
    () => projects.find((project) => project.id === detailsProjectId) ?? null,
    [projects, detailsProjectId],
  );

  const availableInventory = getProjectAvailableInventory(selectedProject);
  const pricePerTon = selectedProject?.pricePerTonUsd ?? selectedProject?.pricePerCreditUsd ?? 0;
  const checkoutValidation = useCheckoutValidation({
    availableCredits: availableInventory,
    requestedQuantity: checkoutForm.quantity,
    pricePerTon,
  });

  const loadProjects = useCallback(async () => {
    try {
      setError("");
      const params = new URLSearchParams({ pageSize: "20" });

      if (canManageListings) {
        params.set("includeAllStatuses", "true");
        if (statusFilter !== "ALL") {
          params.set("status", statusFilter);
        }
      } else {
        params.set("includeSoldOut", "true");
      }

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (categoryFilter !== "ALL") {
        params.set("category", categoryFilter);
      }

      if (sortFilter !== "latest") {
        params.set("sort", sortFilter);
      }

      const response = await marketplaceService.getProjects(`?${params.toString()}`);
      setProjects(response.data);
      setTransactions(response.transactions);
      setSelectedProjectId((current) => {
        const currentProject = response.data.find((project) => project.id === current);
        const currentAvailability = currentProject ? getProjectAvailableInventory(currentProject) : 0;

        if (currentProject?.status === "PUBLISHED" && currentAvailability > 0) {
          return currentProject.id;
        }

        return response.data.find((project) => project.status === "PUBLISHED" && getProjectAvailableInventory(project) > 0)?.id
          ?? currentProject?.id
          ?? response.data[0]?.id
          ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [canManageListings, statusFilter, searchTerm, categoryFilter, sortFilter]);

  useEffect(() => {
    void loadProjects();
    const unsubscribers = [
      socketService.on("projectCreated", () => {
        void loadProjects();
      }),
      socketService.on("projectUpdated", () => {
        void loadProjects();
      }),
      socketService.on("projectDeleted", () => {
        void loadProjects();
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [loadProjects]);

  const metrics = useMemo(() => ({
    retiredCredits: transactions.reduce((sum, transaction) => sum + transaction.quantity, 0),
    publishedProjects: projects.filter((project) => project.status === "PUBLISHED").length,
    remainingCredits: projects.reduce((sum, project) => sum + getProjectAvailableInventory(project), 0),
    offsetSpendUsd: transactions.reduce((sum, transaction) => sum + transaction.totalCostUsd, 0),
  }), [projects, transactions]);

  const liveInventoryValueUsd = useMemo(
    () => projects
      .filter((project) => project.status === "PUBLISHED" || project.status === "SOLD_OUT")
      .reduce((sum, project) => sum + (getProjectAvailableInventory(project) * (project.pricePerTonUsd ?? project.pricePerCreditUsd ?? 0)), 0),
    [projects],
  );

  const carbonBudgetUsd = useMemo(
    () => Math.max(metrics.offsetSpendUsd + (liveInventoryValueUsd * 0.35), 25000),
    [liveInventoryValueUsd, metrics.offsetSpendUsd],
  );

  const checkoutBlockedReason = useMemo(() => {
    if (!selectedProject) {
      return "Select a published listing before starting checkout.";
    }

    if (selectedProject.status === "SOLD_OUT" || selectedProject.availableCredits === 0) {
      return "This listing is sold out and cannot be purchased.";
    }

    if (selectedProject.status === "DRAFT") {
      return "Draft listings are hidden from buyers until they are published.";
    }

    if (selectedProject.status === "ARCHIVED") {
      return "Archived listings are retained for audit history and cannot be purchased.";
    }

    if (getProjectAvailableInventory(selectedProject) <= 0) {
      return "Inventory is temporarily reserved by another checkout.";
    }

    return "";
  }, [selectedProject]);

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setEditingProjectId(null);
    setError("");
  };

  const resetFilters = () => {
    setSearchTerm("");
    setCategoryFilter("ALL");
    setSortFilter("latest");
    setStatusFilter("ALL");
  };

  const openCreateProjectModal = () => {
    setError("");
    setEditingProjectId(null);
    setShowProjectModal(true);
  };

  const startEditingProject = (project: CarbonProject) => {
    if (project.lifecycle?.isImmutable || project.status === "ARCHIVED") {
      showToast({
        tone: "info",
        title: "Listing is locked",
        description: "Listings with completed retirement history can only move through lifecycle actions.",
      });
      return;
    }

    setError("");
    setEditingProjectId(project.id);
    setShowProjectModal(true);
  };

  const submitProject = async (formValues: ProjectManagementFormValues) => {
    try {
      setSavingProject(true);
      setError("");
      const payload = buildProjectPayload(formValues);

      if (editingProjectId) {
        await marketplaceService.updateProject(editingProjectId, payload);
        showToast({
          tone: "success",
          title: "Listing updated",
          description: "Project details, coordinates, and trust documents were saved successfully.",
        });
      } else {
        await marketplaceService.createProject(payload);
        showToast({
          tone: "success",
          title: "Listing created",
          description: payload.status === "DRAFT"
            ? "The listing was saved as a draft and can be published when ready."
            : "The listing is now live in the marketplace.",
        });
      }

      closeProjectModal();
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save marketplace listing");
    } finally {
      setSavingProject(false);
    }
  };

  const updateListingStatus = async (
    project: CarbonProject,
    nextStatus: MarketplaceListingStatus,
    successTitle: string,
    successDescription: string,
  ) => {
    try {
      setError("");
      await marketplaceService.updateProjectStatus(project.id, nextStatus);
      if (editingProjectId === project.id && nextStatus === "ARCHIVED") {
        closeProjectModal();
      }
      await loadProjects();
      showToast({ tone: "success", title: successTitle, description: successDescription });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing status");
    }
  };

  const restoreArchivedProject = async (project: CarbonProject) => {
    try {
      setError("");
      const response = await marketplaceService.toggleProjectStatus(project.id);
      await loadProjects();
      showToast({
        tone: "success",
        title: response.action === "sold_out" ? "Listing restored as sold out" : "Listing restored",
        description: response.reason || "The archived listing is back in the active marketplace lifecycle.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore listing");
    }
  };

  const markProjectSoldOut = async (project: CarbonProject) => {
    try {
      setError("");
      await marketplaceService.markProjectSoldOut(project.id);
      await loadProjects();
      showToast({
        tone: "success",
        title: "Listing marked sold out",
        description: "Buyers can still review the project, but checkout is now blocked.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark listing as sold out");
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    try {
      setConfirmingAction(true);
      setError("");

      if (confirmAction.type === "archive") {
        await marketplaceService.archiveProject(confirmAction.project.id);
        if (editingProjectId === confirmAction.project.id) {
          closeProjectModal();
        }
        await loadProjects();
        showToast({
          tone: "success",
          title: "Listing archived",
          description: "The listing was archived and removed from buyer checkout.",
        });
      } else {
        const response = await marketplaceService.deleteProject(confirmAction.project.id);
        if (editingProjectId === confirmAction.project.id) {
          closeProjectModal();
        }
        await loadProjects();
        showToast({
          tone: response.hardDeleted ? "success" : "info",
          title: response.hardDeleted ? "Listing deleted" : "Listing archived instead",
          description: response.reason || (response.hardDeleted
            ? "The draft listing was permanently removed."
            : "Historical transactions required the listing to be archived instead of deleted."),
        });
      }

      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete listing action");
    } finally {
      setConfirmingAction(false);
    }
  };

  const submitCheckout = async () => {
    if (!selectedProject) {
      setError("Select a project before starting checkout.");
      return;
    }

    if (checkoutBlockedReason) {
      setError(checkoutBlockedReason);
      return;
    }

    if (!checkoutForm.companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    if (checkoutValidation.error) {
      setError(checkoutValidation.error);
      return;
    }

    try {
      setSubmittingCheckout(true);
      setCheckoutState("PROCESSING");
      setError("");

      const reservation = await creditsService.startCheckout({
        companyName: checkoutForm.companyName.trim(),
        projectId: selectedProject.id,
        shipmentId: checkoutForm.shipmentId,
        quantity: checkoutForm.quantity,
        idempotencyKey: crypto.randomUUID(),
      });

      const transaction = await creditsService.completeCheckout(reservation.transactionId);
      setActiveTransaction(transaction);
      setCheckoutState("SUCCESS");
      setShowSuccessModal(true);

      showToast({
        tone: "success",
        title: "Carbon credits retired",
        description: `${resolveTransactionReference(transaction)} is ready and the certificate is available.`,
      });

      await loadProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setCheckoutState("FAILED");
      setError(message);
      showToast({
        tone: "error",
        title: "Checkout failed",
        description: message,
      });
      await loadProjects();
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const downloadCertificate = async (transaction: CarbonCreditTransaction | null) => {
    if (!transaction || transaction.status !== "COMPLETED") {
      return;
    }

    try {
      setDownloadingCertificate(true);
      const { blob, fileName } = await creditsService.downloadCertificate(transaction.id);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not download certificate";
      const userMessage = message.includes("Certificate not found")
        ? "Certificate not found."
        : message.includes("Cannot connect to backend API")
          ? "Unable to connect to backend."
          : message;

      setError(userMessage);
      showToast({
        tone: "error",
        title: "Certificate download failed",
        description: userMessage,
      });
    } finally {
      setDownloadingCertificate(false);
    }
  };

  const checkoutShipmentLabel = checkoutForm.shipmentId
    ? `Shipment ${checkoutForm.shipmentId.slice(0, 8)}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Credit Marketplace</h1>
          <p className="text-muted-foreground">
            Manage draft-to-published marketplace inventory, link retirements to shipments, and give buyers the project evidence they need before checkout.
          </p>
        </div>
        {canManageListings ? (
          <Button onClick={openCreateProjectModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Listing
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <CarbonBudgetWidget
        budgetUsd={carbonBudgetUsd}
        spentUsd={metrics.offsetSpendUsd}
        liveInventoryValueUsd={liveInventoryValueUsd}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Offsets Retired" value={`${metrics.retiredCredits.toLocaleString()} tCO2e`} icon={Leaf} />
        <MetricCard title="Published Listings" value={`${metrics.publishedProjects}`} icon={Globe} />
        <MetricCard title="Available Credits" value={`${metrics.remainingCredits.toLocaleString()}`} icon={BadgeCheck} />
        <MetricCard title="Retirement Spend" value={`$${metrics.offsetSpendUsd.toLocaleString()}`} icon={Award} />
      </div>

      <MarketplaceFilters
        search={searchTerm}
        category={categoryFilter}
        sort={sortFilter}
        onSearchChange={setSearchTerm}
        onCategoryChange={setCategoryFilter}
        onSortChange={setSortFilter}
      />

      {canManageListings ? (
        <div className="flex flex-wrap gap-2">
          {lifecycleFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                statusFilter === filter.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
        <CheckoutDetails
          companyName={checkoutForm.companyName}
          quantity={checkoutForm.quantity}
          shipmentId={checkoutForm.shipmentId}
          availableInventory={availableInventory}
          blockedReason={checkoutBlockedReason}
          validationError={checkoutValidation.error}
          submitting={submittingCheckout}
          disabled={!selectedProject || !checkoutForm.companyName.trim() || checkoutValidation.isCheckoutDisabled || Boolean(checkoutBlockedReason)}
          onCompanyNameChange={(value) => setCheckoutForm((prev) => ({ ...prev, companyName: value }))}
          onQuantityChange={(value) => setCheckoutForm((prev) => ({ ...prev, quantity: value }))}
          onShipmentChange={(value) => setCheckoutForm((prev) => ({ ...prev, shipmentId: value }))}
          onSubmit={submitCheckout}
        />

        <CheckoutSummary
          companyName={checkoutForm.companyName}
          projectName={selectedProject?.name || ""}
          registry={selectedProject?.registry || selectedProject?.verificationStandard || selectedProject?.certification || ""}
          vintageYear={selectedProject?.vintageYear || new Date().getFullYear()}
          quantity={checkoutForm.quantity}
          pricePerTon={pricePerTon}
          shipmentReference={checkoutShipmentLabel}
          subtotal={checkoutValidation.subtotal}
          platformFee={checkoutValidation.platformFee}
          totalCost={checkoutValidation.totalCost}
        />

        <TransactionStatus
          state={checkoutState}
          transaction={activeTransaction}
          error={checkoutState === "FAILED" ? error : undefined}
          downloading={downloadingCertificate}
          onDownloadCertificate={() => downloadCertificate(activeTransaction)}
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading marketplace...</div>
      ) : projects.length === 0 ? (
        <MarketplaceEmptyState onReset={resetFilters} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {projects.map((project) => (
            <MarketplaceCard
              key={project.id}
              project={project}
              isSelected={project.id === selectedProject?.id}
              canManage={canManageListings}
              onSelect={() => setSelectedProjectId(project.id)}
              onViewDetails={() => setDetailsProjectId(project.id)}
              onEdit={() => startEditingProject(project)}
              onPublish={() => {
                void updateListingStatus(
                  project,
                  project.availableCredits > 0 ? "PUBLISHED" : "SOLD_OUT",
                  project.availableCredits > 0 ? "Listing published" : "Listing published as sold out",
                  project.availableCredits > 0
                    ? "The listing is now visible to buyers."
                    : "The listing is visible, but inventory is already exhausted.",
                );
              }}
              onMoveToDraft={() => {
                void updateListingStatus(project, "DRAFT", "Moved to draft", "The listing is hidden from the buyer marketplace until it is published again.");
              }}
              onArchive={() => setConfirmAction({ type: "archive", project })}
              onDelete={() => setConfirmAction({ type: "delete", project })}
              onRestore={() => {
                void restoreArchivedProject(project);
              }}
              onMarkSoldOut={() => {
                void markProjectSoldOut(project);
              }}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Checkout Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Company</th>
                  <th className="px-6 py-3 font-medium">Project</th>
                  <th className="px-6 py-3 font-medium">Registry / Hash</th>
                  <th className="px-6 py-3 font-medium">Shipment</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Platform Fee</th>
                  <th className="px-6 py-3 font-medium">Total Cost</th>
                  <th className="px-6 py-3 font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">No checkout activity recorded yet.</td></tr>
                ) : transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{transaction.companyName || "Company"}</td>
                    <td className="px-6 py-4">
                      <div>{transaction.projectName}</div>
                      <div className="text-xs text-muted-foreground">{transaction.registry}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{resolveTransactionReference(transaction)}</td>
                    <td className="px-6 py-4">{transaction.shipmentReference || "Not linked"}</td>
                    <td className="px-6 py-4">{transaction.status}</td>
                    <td className="px-6 py-4">${(transaction.platformFeeUsd || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">${transaction.totalCostUsd.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={transaction.status !== "COMPLETED"}
                        onClick={() => downloadCertificate(transaction)}
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ProjectManagementModal
        open={showProjectModal}
        mode={editingProject ? "edit" : "create"}
        initialValues={editingProject ? mapProjectToForm(editingProject) : undefined}
        submitting={savingProject}
        error={showProjectModal ? error : ""}
        onClose={closeProjectModal}
        onSubmit={submitProject}
      />

      <ProjectDetailsModal
        open={Boolean(detailsProjectId)}
        project={detailsProject}
        onClose={() => setDetailsProjectId(null)}
      />

      <ConfirmationModal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === "delete" ? "Delete Or Archive Listing" : "Archive Listing"}
        description={confirmAction?.type === "delete"
          ? "Draft listings with no history will be permanently deleted. Listings with checkout history will be archived automatically to preserve trust and audit integrity."
          : "Archived listings remain visible for audit review but are removed from checkout and editing."
        }
        confirmLabel={confirmAction?.type === "delete" ? "Delete / Archive" : "Archive Listing"}
        tone="destructive"
        confirming={confirmingAction}
        onConfirm={handleConfirmAction}
      />

      <Modal
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Checkout Completed"
        description="The transaction has been retired successfully and the PDF certificate is ready."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="font-semibold">Registry / Hash</div>
            <div className="mt-1 break-all font-mono text-xs">{activeTransaction ? resolveTransactionReference(activeTransaction) : "-"}</div>
          </div>
          <div className="grid gap-3 text-sm">
            <SuccessRow label="Project" value={activeTransaction?.projectName || "-"} />
            <SuccessRow label="Registry" value={activeTransaction?.registry || "-"} />
            <SuccessRow label="Quantity" value={`${activeTransaction?.quantity || 0} tCO2e`} />
            <SuccessRow label="Platform Fee" value={`$${(activeTransaction?.platformFeeUsd || 0).toLocaleString()}`} />
            <SuccessRow label="Linked Shipment" value={activeTransaction?.shipmentReference || "Not linked"} />
            <SuccessRow label="Payment Reference" value={activeTransaction?.paymentReference || "-"} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => downloadCertificate(activeTransaction)} disabled={!activeTransaction || activeTransaction.status !== "COMPLETED" || downloadingCertificate}>
              {downloadingCertificate ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Download Certificate
            </Button>
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Leaf }) {
  return (
    <Card>
      <CardContent className="flex items-center space-x-4 p-6">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-2xl font-bold text-foreground">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}

function SuccessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
