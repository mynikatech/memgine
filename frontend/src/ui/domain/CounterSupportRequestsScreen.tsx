import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

import { services } from "@/src/core/services/service-registry";
import type { CounterContext } from "@/src/data/api/counter-api";
import type {
  OrganizationSupportRequest,
  OrganizationSupportRequestDetail,
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

const PAGE_SIZE = 20;
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
const tone = (value: string): BadgeTone =>
  value === "RESOLVED" || value === "CLOSED"
    ? "success"
    : value.includes("WAITING")
      ? "warning"
      : "info";
const isInternal = (
  message: OrganizationSupportRequestDetail["messages"][number],
) => message.isInternal || message.messageType === "INTERNAL_NOTE";

export function CounterSupportRequestsScreen({
  context,
}: {
  context: CounterContext;
}) {
  const theme = useTheme();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestedRequestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;
  const openedRequestId = useRef<string | null>(null);
  const [rows, setRows] = useState<OrganizationSupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OrganizationSupportRequest | null>(
    null,
  );
  const [detail, setDetail] = useState<OrganizationSupportRequestDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The Counter endpoint keeps Store and Counter-staff authorization intact.
      setRows(
        await services.customerSupport.counterList(context.organizationId, {
          storeId: context.storeId,
          staffId: context.staffId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load support requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (request: OrganizationSupportRequest) => {
      setSelected(request);
      setDetail(null);
      setDetailError(null);
      setReply("");
      setNote("");
      setResolution("");
      try {
        const loaded = await services.customerSupport.counterDetail(
          context.organizationId,
          { storeId: context.storeId, staffId: context.staffId },
          request.supportRequestId,
        );
        setDetail(loaded);
        setResolution(loaded.request.resolutionSummary ?? "");
      } catch (cause) {
        setDetailError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the request.",
        );
      }
    },
    [context],
  );

  useEffect(() => {
    if (!requestedRequestId || openedRequestId.current === requestedRequestId)
      return;
    const request = rows.find(
      (row) => row.supportRequestId === requestedRequestId,
    );
    if (!request) return;
    openedRequestId.current = requestedRequestId;
    void open(request);
  }, [open, requestedRequestId, rows]);

  const send = async (internal: boolean) => {
    if (!detail || saving) return;
    const body = (internal ? note : reply).trim();
    if (!body || detail.request.status === "CLOSED") return;
    setSaving(true);
    setDetailError(null);
    try {
      await services.customerSupport.counterMessage(
        context.organizationId,
        { storeId: context.storeId, staffId: context.staffId },
        detail.request.supportRequestId,
        body,
        internal,
      );
      if (internal) setNote("");
      else setReply("");
      await open(detail.request);
      await load();
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Unable to add the message.",
      );
    } finally {
      setSaving(false);
    }
  };

  const transition = async (action: "resolve" | "close") => {
    if (!detail || saving) return;
    if (detail.request.category === "PAYMENT") {
      setDetailError("Financial requests are read-only for Counter staff.");
      return;
    }
    if (action === "resolve" && !resolution.trim()) {
      setDetailError(
        "Enter a resolution summary before resolving this request.",
      );
      return;
    }
    setSaving(true);
    setDetailError(null);
    try {
      await services.customerSupport.counterTransition(
        context.organizationId,
        { storeId: context.storeId, staffId: context.staffId },
        detail.request.supportRequestId,
        action === "resolve"
          ? {
              status: "RESOLVED",
              resolutionSummary: resolution.trim(),
              versionNo: detail.request.versionNo,
            }
          : { status: "CLOSED", versionNo: detail.request.versionNo },
        action,
      );
      await open(detail.request);
      await load();
    } catch (cause) {
      setDetailError(
        cause instanceof Error
          ? cause.message
          : "Unable to update this request.",
      );
    } finally {
      setSaving(false);
    }
  };

  const statuses = useMemo(
    () => [...new Set(rows.map((row) => row.status))].sort(),
    [rows],
  );
  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (category && row.category !== category) return false;
      return (
        !query ||
        [row.ticketNumber, row.subject, row.customerUserId, row.issueType]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [category, rows, search, status]);
  const visibleRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const canGoNext = (page + 1) * PAGE_SIZE < filtered.length;

  useEffect(() => {
    setPage(0);
  }, [search, status, category]);

  const columns = useMemo<DataTableColumn<OrganizationSupportRequest>[]>(
    () => [
      {
        key: "ticket",
        title: "Ticket",
        width: 140,
        render: (row) => (
          <Text variant="bodyStrong" color="text">
            {row.ticketNumber}
          </Text>
        ),
      },
      {
        key: "request",
        title: "Request",
        width: 300,
        render: (row) => (
          <View style={{ gap: 2 }}>
            <Text variant="body" color="text">
              {row.subject}
            </Text>
            <Text variant="caption" color="textMuted">
              {label(row.category)} / {label(row.issueType)}
            </Text>
          </View>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 180,
        render: (row) => (
          <Badge label={label(row.status)} tone={tone(row.status)} />
        ),
      },
      {
        key: "updated",
        title: "Updated",
        width: 190,
        render: (row) => (
          <Text variant="bodySmall" color="textMuted">
            {new Date(row.updatedAt).toLocaleString()}
          </Text>
        ),
      },
    ],
    [],
  );
  const canManage = detail?.request.category !== "PAYMENT";
  const isClosed = detail?.request.status === "CLOSED";

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
          Customer support requests for this organization. Payment, refund and
          other financial operations require administrator access.
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.md,
        }}
      >
        <Input
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Ticket, subject, customer"
        />
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
          label="Category"
          value={category}
          allowClear
          placeholder="All categories"
          items={categories}
          onChange={setCategory}
          getItemId={(item) => item}
          renderItemLabel={label}
        />
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
        <>
          <DataTable
            columns={columns}
            data={visibleRows}
            keyExtractor={(row) => row.supportRequestId}
            emptyMessage="No support requests match these filters."
            actions={[{ label: "View", onPress: (row) => void open(row) }]}
            minTableWidth={820}
            actionsWidth={90}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text variant="bodySmall" color="textMuted">
              {filtered.length} request{filtered.length === 1 ? "" : "s"}
            </Text>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Button
                label="Previous"
                variant="secondary"
                disabled={page === 0}
                onPress={() => setPage((value) => Math.max(0, value - 1))}
              />
              <Button
                label="Next"
                variant="secondary"
                disabled={!canGoNext}
                onPress={() => setPage((value) => value + 1)}
              />
            </View>
          </View>
        </>
      )}
      <Modal
        visible={selected !== null}
        onClose={() => !saving && setSelected(null)}
        title={
          detail
            ? `${detail.request.ticketNumber} · ${label(detail.request.status)}`
            : "Support request"
        }
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
                {label(detail.request.category)} /{" "}
                {label(detail.request.issueType)} · Opened{" "}
                {new Date(detail.request.createdAt).toLocaleString()}
              </Text>
              <Text variant="body" color="text">
                {detail.request.description}
              </Text>
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Conversation
              </Text>
              {detail.messages
                .filter((message) => !isInternal(message))
                .map((message) => (
                  <View
                    key={message.supportMessageId}
                    style={{
                      padding: theme.spacing.md,
                      backgroundColor: theme.colors.surfaceAlt,
                      borderRadius: theme.radius.md,
                      gap: theme.spacing.xs,
                    }}
                  >
                    <Text variant="bodyStrong" color="text">
                      {message.authorRole === "CUSTOMER"
                        ? "Customer"
                        : "Business Support"}
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
                value={reply}
                onChangeText={setReply}
                placeholder="Reply to customer"
                maxLength={8000}
                editable={!saving && !isClosed}
              />
              <Button
                label={saving ? "Sending…" : "Send reply"}
                disabled={saving || isClosed || !reply.trim()}
                onPress={() => void send(false)}
              />
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3" color="text">
                Internal notes
              </Text>
              {detail.messages.filter(isInternal).map((message) => (
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
                      : "Business Support"}
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
                placeholder="Add an internal note"
                maxLength={8000}
                editable={!saving && !isClosed}
              />
              <Button
                label={saving ? "Saving…" : "Add internal note"}
                variant="secondary"
                disabled={saving || isClosed || !note.trim()}
                onPress={() => void send(true)}
              />
            </View>
            {!canManage ? (
              <Text variant="bodySmall" color="warning">
                Financial request lifecycle actions are read-only for Counter
                staff.
              </Text>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="h3" color="text">
                  Resolution
                </Text>
                {detail.request.status === "RESOLVED" ? null : (
                  <TextArea
                    value={resolution}
                    onChangeText={setResolution}
                    placeholder="Resolution summary"
                    maxLength={8000}
                    editable={!saving && !isClosed}
                  />
                )}
                {detail.request.status === "RESOLVED" ? (
                  <Button
                    label={saving ? "Closing…" : "Close request"}
                    disabled={saving}
                    onPress={() => void transition("close")}
                  />
                ) : (
                  <Button
                    label={saving ? "Resolving…" : "Resolve request"}
                    disabled={saving || isClosed || !resolution.trim()}
                    onPress={() => void transition("resolve")}
                  />
                )}
              </View>
            )}
          </View>
        ) : null}
      </Modal>
    </ScrollView>
  );
}
