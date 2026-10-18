import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import type { ReferenceDataItem } from "@/src/core/services/reference-data";
import { apis } from "@/src/data/data-registry";
import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type {
  OrganizationSupportRequest,
  OrganizationSupportRequestDetail,
  PaymentExceptionCandidate,
  PaymentInvestigation,
} from "@/src/data/api/customer-support-api";
import { useTheme } from "@/src/providers";
import {
  Badge,
  Button,
  DataTable,
  type BadgeTone,
  type DataTableColumn,
  Input,
  Modal,
  ReferenceSelect,
  StateView,
  Text,
  TextArea,
} from "@/src/ui";

const statuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "WAITING_FOR_BUSINESS",
  "RESOLVED",
  "CLOSED",
];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const tone = (value: string): BadgeTone =>
  value === "RESOLVED" || value === "CLOSED"
    ? "success"
    : value === "URGENT" || value === "HIGH"
      ? "warning"
      : "info";
const isInternalSupportMessage = (
  message: OrganizationSupportRequestDetail["messages"][number],
): boolean =>
  message.isInternal ||
  message.messageType === "INTERNAL_NOTE" ||
  message.messageType === "PLATFORM_RECOMMENDATION";
type Assignee = { userId: string; name: string };

export type SupportRequestsScope = "organization" | "platform";

export function SupportRequestsScreen({
  scope,
  organizationId,
}: {
  scope: SupportRequestsScope;
  organizationId?: string;
}) {
  const isPlatform = scope === "platform";
  const scopedOrganizationId = organizationId ?? "";
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestedRequestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;
  const openedNotificationRequestId = useRef<string | null>(null);
  const theme = useTheme();
  const [rows, setRows] = useState<OrganizationSupportRequest[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [assigned, setAssigned] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [supportCategories, setSupportCategories] = useState<
    ReferenceDataItem[]
  >([]);
  const [selected, setSelected] = useState<OrganizationSupportRequest | null>(
    null,
  );
  const [detail, setDetail] = useState<OrganizationSupportRequestDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [resolution, setResolution] = useState("");
  const [investigation, setInvestigation] =
    useState<PaymentInvestigation | null>(null);
  const [candidates, setCandidates] = useState<PaymentExceptionCandidate[]>([]);
  const [investigationReason, setInvestigationReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [investigationDescription, setInvestigationDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requests, access] = await Promise.all([
        isPlatform
          ? services.customerSupport.platformList({
              organizationId: selectedOrganizationId || undefined,
              category: category || undefined,
              status: status || undefined,
              priority: priority || undefined,
            })
          : services.customerSupport.organizationList(scopedOrganizationId, {
              category: category || undefined,
              status: status || undefined,
              priority: priority || undefined,
            }),
        isPlatform
          ? Promise.resolve(null)
          : apis.organizationAccess.list(scopedOrganizationId),
      ]);
      setRows(requests);
      if (access?.success) {
        setAssignees(
          access.data
            .filter((user) => user.capabilities.includes("ORG_ADMIN_ACCESS"))
            .map((user) => ({
              userId: user.userId,
              name: user.displayName || user.email || user.userId,
            })),
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load support requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [isPlatform, scopedOrganizationId, selectedOrganizationId, category, status, priority]);
  useEffect(() => {
    let active = true;

    void services.referenceData
      .listSupportCategories()
      .then((items) => {
        if (active) {
          setSupportCategories(items.filter((item) => item.active));
        }
      })
      .catch((error) => {
        console.error("Unable to load support categories", error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlatform) return;
    let active = true;
    void services.organization
      .listOrganizations()
      .then((items) => {
        if (active) {
          setOrganizations(
            items
              .filter((item) => !item.isDeleted)
              .map((item) => ({ id: item.id, name: item.name })),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isPlatform]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (request: OrganizationSupportRequest) => {
    setSelected(request);
    setDetail(null);
    setDetailError(null);
    setReply("");
    setNote("");
    try {
      const loaded = isPlatform
        ? await services.customerSupport.platformDetail(request.supportRequestId)
        : await services.customerSupport.organizationDetail(
            scopedOrganizationId,
            request.supportRequestId,
          );
      setDetail(loaded);
      setEditStatus(loaded.request.status);
      setEditPriority(loaded.request.priority);
      setEditAssignee(loaded.request.assignedToUserId ?? "");
      setResolution(loaded.request.resolutionSummary ?? "");
      if (!isPlatform && loaded.request.category === "PAYMENT") {
        const [currentInvestigation, paymentCandidates] = await Promise.all([
          services.customerSupport.paymentInvestigation(
            scopedOrganizationId,
            request.supportRequestId,
          ),
          services.customerSupport.paymentExceptionCandidates(
            scopedOrganizationId,
            request.supportRequestId,
          ),
        ]);
        setInvestigation(currentInvestigation);
        setCandidates(paymentCandidates);
      } else {
        setInvestigation(null);
        setCandidates([]);
      }
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Unable to load the request.",
      );
    }
  };

  const escalateInvestigation = async () => {
    if (!detail || !investigationReason.trim() || saving) return;
    setSaving(true);
    setDetailError(null);
    try {
      await services.customerSupport.escalatePaymentInvestigation(
        scopedOrganizationId,
        detail.request.supportRequestId,
        {
          reason: investigationReason.trim(),
          paymentReference: paymentReference.trim() || undefined,
          description: investigationDescription.trim() || undefined,
        },
      );
      await open(detail.request);
    } catch (cause) {
      setDetailError(
        cause instanceof Error
          ? cause.message
          : "Unable to escalate for payment investigation.",
      );
    } finally {
      setSaving(false);
    }
  };

  const linkException = async (exceptionId: string) => {
    if (!detail || saving) return;
    setSaving(true);
    setDetailError(null);
    try {
      await services.customerSupport.linkPaymentException(
        scopedOrganizationId,
        detail.request.supportRequestId,
        exceptionId,
      );
      await open(detail.request);
    } catch (cause) {
      setDetailError(
        cause instanceof Error
          ? cause.message
          : "Unable to link the payment exception.",
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (
      !requestedRequestId ||
      openedNotificationRequestId.current === requestedRequestId
    ) {
      return;
    }

    openedNotificationRequestId.current = requestedRequestId;
    const request = rows.find(
      (row) => row.supportRequestId === requestedRequestId,
    );
    if (request) {
      void open(request);
      return;
    }

    let cancelled = false;
    void (isPlatform
      ? services.customerSupport.platformDetail(requestedRequestId)
      : services.customerSupport.organizationDetail(
          scopedOrganizationId,
          requestedRequestId,
        ))
      .then((loaded) => {
        if (cancelled) return;
        setSelected(loaded.request);
        setDetail(loaded);
        setDetailError(null);
        setReply("");
        setNote("");
        setEditStatus(loaded.request.status);
        setEditPriority(loaded.request.priority);
        setEditAssignee(loaded.request.assignedToUserId ?? "");
        setResolution(loaded.request.resolutionSummary ?? "");
      })
      .catch((cause) => {
        if (cancelled) return;
        setSelected({
          supportRequestId: requestedRequestId,
          ticketNumber: "Support request",
        } as OrganizationSupportRequest);
        setDetailError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the request.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isPlatform, scopedOrganizationId, requestedRequestId, rows]);

  const refreshDetail = async () => {
    if (!selected) return;
    await Promise.all([load(), open(selected)]);
  };

  const send = async (kind: "reply" | "note" | "recommendation") => {
    const internal = kind !== "reply";
    const body = (internal ? note : reply).trim();
    if (!detail || !body || saving) return;
    setSaving(true);
    setDetailError(null);
    try {
      if (isPlatform) {
        await services.customerSupport.platformMessage(
          detail.request.supportRequestId,
          body,
          kind,
        );
      } else {
        await services.customerSupport.organizationMessage(
          scopedOrganizationId,
          detail.request.supportRequestId,
          body,
          internal,
        );
      }
      if (internal) setNote("");
      else setReply("");
      await refreshDetail();
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Unable to add the message.",
      );
    } finally {
      setSaving(false);
    }
  };

  const update = async () => {
    if (!detail || saving) return;
    if (editStatus === "RESOLVED" && !resolution.trim()) {
      setDetailError(
        "A meaningful resolution summary is required to resolve this request.",
      );
      return;
    }
    setSaving(true);
    setDetailError(null);
    try {
      await services.customerSupport.updateOrganization(
        scopedOrganizationId,
        detail.request.supportRequestId,
        {
          status: editStatus,
          priority: editPriority,
          assignedToUserId: editAssignee || undefined,
          resolutionSummary: resolution.trim() || undefined,
          versionNo: detail.request.versionNo,
        },
      );
      await refreshDetail();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unable to update the request.";
      setDetailError(
        /updated by another user|version/i.test(message)
          ? "This request changed elsewhere. The latest version has been reloaded."
          : message,
      );
      if (/updated by another user|version/i.test(message))
        await refreshDetail();
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (isPlatform || !source || row.source === source) &&
          (isPlatform || !assigned || row.assignedToUserId === assigned),
      ),
    [rows, isPlatform, source, assigned],
  );
  const assigneeName = (id?: string | null) =>
    assignees.find((item) => item.userId === id)?.name ??
    (id ? "Assigned administrator" : "Unassigned");
  const operationalFieldsLocked =
    !isPlatform &&
    (detail?.request.status === "RESOLVED" || detail?.request.status === "CLOSED");
  const requestClosed = detail?.request.status === "CLOSED";
  const columns = useMemo<DataTableColumn<OrganizationSupportRequest>[]>(
    () => [
      {
        key: "ticket",
        title: "Ticket",
        width: 120,
        render: (row) => (
          <Text variant="bodyStrong" color="text">
            {row.ticketNumber}
          </Text>
        ),
      },
      {
        key: "subject",
        title: "Request",
        width: 250,
        render: (row) => (
          <View>
            <Text variant="body" color="text">
              {row.subject}
            </Text>
            <Text variant="caption" color="textMuted">
              Customer account · {label(row.category)} / {label(row.issueType)}
            </Text>
          </View>
        ),
      },
      ...(isPlatform
        ? [
            {
              key: "organization",
              title: "Organization",
              width: 190,
              render: (row: OrganizationSupportRequest) => (
                <Text variant="bodySmall" color="textMuted">
                  {organizations.find((item) => item.id === row.organizationId)
                    ?.name ?? row.organizationId}
                </Text>
              ),
            } satisfies DataTableColumn<OrganizationSupportRequest>,
          ]
        : []),
      {
        key: "source",
        title: "Source",
        width: 110,
        render: (row) => (
          <Text variant="body" color="text">
            {label(row.source)}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 150,
        render: (row) => (
          <Badge label={label(row.status)} tone={tone(row.status)} />
        ),
      },
      {
        key: "priority",
        title: "Priority",
        width: 120,
        render: (row) => (
          <Badge label={label(row.priority)} tone={tone(row.priority)} />
        ),
      },
      {
        key: "updated",
        title: "Updated",
        width: 180,
        render: (row) => (
          <Text variant="bodySmall" color="textMuted">
            {new Date(row.updatedAt).toLocaleString()}
          </Text>
        ),
      },
    ],
    [isPlatform, organizations],
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.lg,
        gap: theme.spacing.lg,
        maxWidth: 1500,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" color="text">
          Support Requests
        </Text>
        <Text variant="bodySmall" color="textMuted">
          {isPlatform
            ? "Customer support requests across organizations."
            : "Customer support requests for this organization."}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.md,
        }}
      >
        <ReferenceSelect
          label="Status"
          value={status}
          allowClear
          placeholder="All statuses"
          items={statuses}
          onChange={setStatus}
          getItemId={(item) => item}
          renderItemLabel={label}
        />
        <ReferenceSelect
          label="Priority"
          value={priority}
          allowClear
          placeholder="All priorities"
          items={priorities}
          onChange={setPriority}
          getItemId={(item) => item}
          renderItemLabel={label}
        />
        <ReferenceSelect
          label="Category"
          value={category}
          allowClear
          placeholder="All categories"
          items={supportCategories}
          onChange={setCategory}
          getItemId={(item) => item.code}
          renderItemLabel={(item) => item.name}
        />
        {isPlatform ? (
          <ReferenceSelect
            label="Organization"
            value={selectedOrganizationId}
            allowClear
            placeholder="All organizations"
            items={organizations}
            onChange={setSelectedOrganizationId}
            getItemId={(item) => item.id}
            renderItemLabel={(item) => item.name}
          />
        ) : (
          <>
            <ReferenceSelect
              label="Source"
              value={source}
              allowClear
              placeholder="All sources"
              items={["CUSTOMER", "SYSTEM"]}
              onChange={setSource}
              getItemId={(item) => item}
              renderItemLabel={label}
            />
            <ReferenceSelect
              label="Assigned to"
              value={assigned}
              allowClear
              placeholder="Anyone"
              items={assignees}
              onChange={setAssigned}
              getItemId={(item) => item.userId}
              renderItemLabel={(item) => item.name}
            />
          </>
        )}
      </View>
      {loading ? (
        <StateView kind="loading" title="Loading support requests" />
      ) : error ? (
        <StateView
          kind="error"
          title="Unable to load support requests"
          message={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(row) => row.supportRequestId}
          emptyMessage="No support requests match these filters."
          actions={[{ label: "View", onPress: (row) => void open(row) }]}
          minTableWidth={1100}
          actionsWidth={90}
        />
      )}
      <Modal
        visible={selected !== null}
        onClose={() => !saving && setSelected(null)}
        title={detail?.request.ticketNumber ?? "Support request"}
        scrollable
      >
        {detailError ? (
          <Text variant="bodySmall" color="danger">
            {detailError}
          </Text>
        ) : null}
        {!detail && !detailError ? (
          <StateView kind="loading" title="Loading request" />
        ) : null}
        {detail ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="h3" color="text">
                {detail.request.subject}
              </Text>
              <Text variant="bodySmall" color="textMuted">
                Customer account · {label(detail.request.source)} · Opened{" "}
                {new Date(detail.request.createdAt).toLocaleString()}
              </Text>
              <Text variant="body" color="text">
                {detail.request.description}
              </Text>
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Customer-visible conversation
              </Text>
              {detail.messages
                .filter((message) => !isInternalSupportMessage(message))
                .map((message) => (
                  <View
                    key={message.supportMessageId}
                    style={{
                      padding: theme.spacing.md,
                      backgroundColor:
                        message.authorRole === "CUSTOMER"
                          ? theme.colors.primarySoft
                          : theme.colors.surfaceAlt,
                      borderRadius: theme.radius.md,
                      gap: theme.spacing.xs,
                    }}
                  >
                    <Text variant="bodyStrong" color="text">
                      {message.authorRole === "CUSTOMER"
                        ? "Customer"
                        : message.authorRole === "ORG_ADMIN"
                          ? "Business support"
                          : "Memgine Support"}
                    </Text>
                    <Text variant="body" color="text">
                      {message.messageBody}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {new Date(message.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))}
            </View>
            {!isPlatform ? <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Reply to customer
              </Text>
              <Text variant="caption" color="textMuted">
                The customer will see this reply.
              </Text>
              <TextArea
                value={reply}
                onChangeText={setReply}
                placeholder="Write a customer-visible reply"
                maxLength={8000}
              />
              <Button
                label={saving ? "Sending…" : "Send reply"}
                disabled={saving || !reply.trim()}
                onPress={() => void send("reply")}
              />
            </View> : null}
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Internal investigation
              </Text>
              <Text variant="caption" color="warning">
                Internal note — not visible to the customer
              </Text>
              {detail.messages
                .filter(isInternalSupportMessage)
                .map((message) => (
                  <View
                    key={message.supportMessageId}
                    style={{
                      padding: theme.spacing.md,
                      backgroundColor: theme.colors.warningSoft,
                      borderRadius: theme.radius.md,
                      gap: theme.spacing.xs,
                    }}
                  >
                    <Text variant="bodyStrong" color="text">
                      {message.authorRole === "PLATFORM_ADMIN"
                        ? "Platform Support"
                        : message.authorRole === "ORG_ADMIN"
                          ? "Business Support"
                          : "Support"}
                      {" — "}
                      {message.authorName?.trim() || "Support team member"}
                    </Text>
                    <Text variant="body" color="text">
                      {message.messageBody}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {new Date(message.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))}
              <TextArea
                value={note}
                onChangeText={setNote}
                placeholder="Add an internal investigation note"
                maxLength={8000}
              />
              <Button
                label={saving ? "Saving…" : "Add internal note"}
                variant="secondary"
                disabled={saving || !note.trim()}
                onPress={() => void send("note")}
              />
              {isPlatform ? (
                <Button
                  label={saving ? "Saving…" : "Add platform recommendation"}
                  variant="secondary"
                  disabled={saving || !note.trim()}
                  onPress={() => void send("recommendation")}
                />
              ) : null}
            </View>
            {!isPlatform && detail.request.category === "PAYMENT" ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="h3" color="text">
                  Payment Investigation
                </Text>
                {investigation ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text variant="bodyStrong" color="text">
                      {label(investigation.state)}
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      {investigation.escalationReason}
                    </Text>
                    {investigation.paymentReference ? (
                      <Text variant="caption" color="textMuted">
                        Reference: {investigation.paymentReference}
                      </Text>
                    ) : null}
                    {investigation.financialExceptionId ? (
                      <Button
                        label="View linked exception"
                        variant="secondary"
                        onPress={() =>
                          router.push(
                            `${APP_ROUTES.orgAdmin.paymentExceptions(scopedOrganizationId)}?financialExceptionId=${encodeURIComponent(investigation.financialExceptionId!)}` as never,
                          )
                        }
                      />
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text variant="bodySmall" color="textMuted">
                      Escalate this customer-reported payment concern for
                      internal review. This does not create a verified financial
                      exception or charge the customer.
                    </Text>
                    <TextArea
                      label="Reason for escalation"
                      value={investigationReason}
                      onChangeText={setInvestigationReason}
                      placeholder="Explain why financial review is needed"
                      maxLength={500}
                    />
                    <Input
                      label="Payment or order reference (optional)"
                      value={paymentReference}
                      onChangeText={setPaymentReference}
                      placeholder="Receipt, payment, order, or attempt reference"
                      editable={!saving}
                    />
                    <TextArea
                      label="Investigation details (optional)"
                      value={investigationDescription}
                      onChangeText={setInvestigationDescription}
                      placeholder="Known supporting identifiers or context"
                      maxLength={2000}
                    />
                    <Button
                      label={
                        saving
                          ? "Escalating…"
                          : "Escalate to Payment Investigation"
                      }
                      disabled={saving || !investigationReason.trim()}
                      onPress={() => void escalateInvestigation()}
                    />
                  </>
                )}
                {candidates.length > 0 ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text variant="bodyStrong" color="text">
                      Existing verified exceptions
                    </Text>
                    {candidates.map((candidate) => (
                      <View
                        key={candidate.financialExceptionId}
                        style={{
                          padding: theme.spacing.sm,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.sm,
                          gap: theme.spacing.xs,
                        }}
                      >
                        <Text variant="body" color="text">
                          {candidate.currencyCode}{" "}
                          {(candidate.amountMinor / 100).toFixed(2)} ·{" "}
                          {label(candidate.caseStatus)}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {candidate.providerReferenceId ||
                            candidate.paymentIntentId ||
                            candidate.financialExceptionId}
                        </Text>
                        <Button
                          label="Link verified exception"
                          variant="secondary"
                          disabled={
                            saving ||
                            investigation?.financialExceptionId ===
                              candidate.financialExceptionId
                          }
                          onPress={() =>
                            void linkException(candidate.financialExceptionId)
                          }
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {!isPlatform ? <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Manage request
              </Text>
              <ReferenceSelect
                label="Status"
                value={editStatus}
                items={detail.request.status === "RESOLVED" ? ["RESOLVED", "CLOSED"] : statuses}
                onChange={setEditStatus}
                disabled={requestClosed}
                getItemId={(item) => item}
                renderItemLabel={label}
              />
              <ReferenceSelect
                label="Priority"
                value={editPriority}
                items={priorities}
                onChange={setEditPriority}
                disabled={operationalFieldsLocked}
                getItemId={(item) => item}
                renderItemLabel={label}
              />
              <ReferenceSelect
                label="Assign to"
                value={editAssignee}
                items={assignees}
                onChange={setEditAssignee}
                placeholder="Select administrator"
                disabled={operationalFieldsLocked}
                getItemId={(item) => item.userId}
                renderItemLabel={(item) => item.name}
              />
              <TextArea
                label="Resolution summary"
                value={resolution}
                onChangeText={setResolution}
                placeholder="Required when resolving this request"
                maxLength={2000}
                editable={!operationalFieldsLocked}
              />
              {!requestClosed ? <Button
                label={saving ? "Saving…" : detail.request.status === "RESOLVED" ? "Close request" : "Save changes"}
                disabled={saving || (detail.request.status === "RESOLVED" && editStatus !== "CLOSED")}
                onPress={() => void update()}
              /> : <Text variant="bodySmall" color="textMuted">Operational fields are locked after closure.</Text>}
            </View> : null}
            {detail.feedback ? <View style={{ gap: theme.spacing.xs }}>
              <Text variant="h3" color="text">Customer Feedback</Text>
              {detail.feedback.rating ? <Text variant="bodyStrong" color="text">{label(detail.feedback.rating)}</Text> : null}
              {detail.feedback.feedbackComment ? <Text variant="body" color="text">{detail.feedback.feedbackComment}</Text> : null}
              <Text variant="caption" color="textMuted">Submitted {new Date(detail.feedback.submittedAt).toLocaleString()}</Text>
            </View> : null}
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Activity history
              </Text>
              {detail.events.map((event) => (
                <View
                  key={event.eventId}
                  style={{
                    borderLeftWidth: 2,
                    borderLeftColor: theme.colors.border,
                    paddingLeft: theme.spacing.md,
                  }}
                >
                  <Text variant="bodySmall" color="text">
                    {event.description}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {new Date(event.createdAt).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Modal>
    </ScrollView>
  );
}
