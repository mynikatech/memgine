import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type { CustomerSupportRequestDetail } from "@/src/data/api/customer-support-api";
import { Screen } from "@/src/layout";
import { useCustomerContext, useTheme } from "@/src/providers";
import {
  Badge,
  Button,
  Card,
  Header,
  StateView,
  Text,
  TextArea,
} from "@/src/ui";

const roleLabel = (role: string) => {
  if (role === "CUSTOMER") return "You";
  if (role === "PLATFORM_ADMIN") return "Memgine Support";
  if (role === "ORG_ADMIN") return "Business Support";
  return role.replaceAll("_", " ");
};

export default function CustomerSupportRequestDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;
  const theme = useTheme();
  const { landing } = useCustomerContext();
  const [detail, setDetail] = useState<CustomerSupportRequestDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  const load = useCallback(async () => {
    if (!requestId) {
      setError("Support request was not found.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setDetail(await services.customerSupport.detail(requestId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load this support request.",
      );
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const send = async () => {
    if (!requestId || !reply.trim() || sending) return;
    setSending(true);
    try {
      await services.customerSupport.addMessage(requestId, reply.trim());
      setReply("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send your reply.",
      );
    } finally {
      setSending(false);
    }
  };

  const reopen = async () => {
    if (!requestId || !reopenReason.trim() || reopening) return;
    setReopening(true);
    try {
      await services.customerSupport.reopen(requestId, reopenReason.trim());
      setReopenReason("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reopen this request.",
      );
    } finally {
      setReopening(false);
    }
  };

  const close = async () => {
    if (!requestId || closing) return;
    setClosing(true);
    try {
      await services.customerSupport.close(requestId);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to close this request.",
      );
    } finally {
      setClosing(false);
    }
  };

  const submitFeedback = async () => {
    if (
      !requestId ||
      submittingFeedback ||
      (!feedbackRating && !feedbackComment.trim())
    )
      return;
    setSubmittingFeedback(true);
    try {
      await services.customerSupport.submitFeedback(requestId, {
        rating: feedbackRating ?? undefined,
        comment: feedbackComment.trim() || undefined,
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to submit feedback.",
      );
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading)
    return (
      <Screen>
        <StateView kind="loading" title="Loading support request" />
      </Screen>
    );
  if (error && !detail)
    return (
      <Screen header={<Header title="Support Request" />}>
        <StateView
          kind="error"
          title="Unable to load support request"
          message={error}
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            void load();
          }}
        />
      </Screen>
    );
  if (!detail) return null;
  const request = detail.request;
  const business = request.organizationId
    ? landing?.discoverableOrganizations.find(
        (item) => item.organizationId === request.organizationId,
      )
    : undefined;
  const isResolved = request.status === "RESOLVED";
  const isClosed = request.status === "CLOSED";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen
        header={
          <Header
            title={request.ticketNumber}
            subtitle={
              request.supportDestination === "PLATFORM"
                ? "Memgine Support"
                : business?.displayName || business?.name || "Support request"
            }
            left={
              <Button
                label="Back"
                variant="ghost"
                size="sm"
                onPress={() =>
                  router.replace(APP_ROUTES.customer.support as never)
                }
              />
            }
          />
        }
        contentStyle={{ maxWidth: 820, width: "100%", alignSelf: "center" }}
      >
        {error ? (
          <Text variant="bodySmall" color="danger">
            {error}
          </Text>
        ) : null}
        <Card style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Badge
              label={request.status.replaceAll("_", " ")}
              tone={isResolved ? "success" : isClosed ? "neutral" : "info"}
            />
            <Badge
              label={request.category.replaceAll("_", " ")}
              tone="neutral"
            />
          </View>
          <Text variant="h3" color="text">
            {request.subject}
          </Text>
          <Text variant="bodySmall" color="textMuted">
            {request.issueType.replaceAll("_", " ")} · Created{" "}
            {new Date(request.createdAt).toLocaleString()}
          </Text>
          <Text variant="body" color="text">
            {request.description}
          </Text>
          {request.resolutionSummary ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="bodyStrong" color="text">
                Resolution
              </Text>
              <Text variant="body" color="text">
                {request.resolutionSummary}
              </Text>
            </View>
          ) : null}
        </Card>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3" color="text">
            Conversation
          </Text>
          {detail.messages.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No replies yet.
            </Text>
          ) : null}
          {detail.messages.map((message) => (
            <Card
              key={message.supportMessageId}
              style={{
                gap: theme.spacing.xs,
                backgroundColor:
                  message.authorRole === "CUSTOMER"
                    ? theme.colors.primarySoft
                    : theme.colors.surface,
              }}
            >
              <Text variant="bodyStrong" color="text">
                {roleLabel(message.authorRole)}
              </Text>
              <Text variant="body" color="text">
                {message.messageBody}
              </Text>
              <Text variant="caption" color="textMuted">
                {new Date(message.createdAt).toLocaleString()}
              </Text>
            </Card>
          ))}
        </View>

        {!isClosed && !isResolved ? (
          <View style={{ gap: theme.spacing.sm }}>
            <TextArea
              label="Reply"
              value={reply}
              onChangeText={setReply}
              placeholder="Add more details or respond to support."
              maxLength={8000}
            />
            <Button
              label={sending ? "Sending…" : "Send reply"}
              disabled={sending || !reply.trim()}
              onPress={() => void send()}
            />
          </View>
        ) : null}
        {isResolved ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong" color="text">
              Is this resolved?
            </Text>
            <Button
              label={closing ? "Closing…" : "Accept & Close"}
              disabled={closing || reopening}
              onPress={() => void close()}
            />
            <Text variant="bodyStrong" color="text">
              Still need help? Reopen request
            </Text>
            <TextArea
              label="Why does this still need help?"
              value={reopenReason}
              onChangeText={setReopenReason}
              placeholder="Explain what remains unresolved."
              maxLength={8000}
            />
            <Button
              label={reopening ? "Reopening…" : "Reopen request"}
              variant="secondary"
              disabled={closing || reopening || !reopenReason.trim()}
              onPress={() => void reopen()}
            />
          </View>
        ) : null}
        {isClosed ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="h3" color="text">
              Customer Feedback
            </Text>
            {detail.feedback ? (
              <>
                {detail.feedback.rating ? (
                  <Text variant="bodyStrong" color="text">
                    {detail.feedback.rating.replaceAll("_", " ")}
                  </Text>
                ) : null}
                {detail.feedback.feedbackComment ? (
                  <Text variant="body" color="text">
                    {detail.feedback.feedbackComment}
                  </Text>
                ) : null}
                <Text variant="caption" color="textMuted">
                  Submitted{" "}
                  {new Date(detail.feedback.submittedAt).toLocaleString()}
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodySmall" color="textMuted">
                  Optional: tell us how this support request went.
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: theme.spacing.xs,
                  }}
                >
                  {["VERY_BAD", "BAD", "OKAY", "GOOD", "VERY_GOOD"].map(
                    (rating) => (
                      <Button
                        key={rating}
                        size="sm"
                        variant={
                          feedbackRating === rating ? "primary" : "secondary"
                        }
                        label={rating.replaceAll("_", " ")}
                        disabled={submittingFeedback}
                        onPress={() => setFeedbackRating(rating)}
                      />
                    ),
                  )}
                </View>
                <TextArea
                  label="Comments (optional)"
                  value={feedbackComment}
                  onChangeText={setFeedbackComment}
                  placeholder="Tell us more about your experience."
                  maxLength={1000}
                />
                <Button
                  label={submittingFeedback ? "Submitting…" : "Submit Feedback"}
                  disabled={
                    submittingFeedback ||
                    (!feedbackRating && !feedbackComment.trim())
                  }
                  onPress={() => void submitFeedback()}
                />
              </>
            )}
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3" color="text">
            Activity
          </Text>
          {detail.events.map((event) => (
            <View
              key={event.eventId}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: theme.colors.border,
                paddingLeft: theme.spacing.md,
                gap: 2,
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
      </Screen>
    </KeyboardAvoidingView>
  );
}
