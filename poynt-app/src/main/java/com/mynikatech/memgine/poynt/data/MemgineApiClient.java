package com.mynikatech.memgine.poynt.data;

import com.mynikatech.memgine.poynt.BuildConfig;
import com.mynikatech.memgine.poynt.model.*;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

/** HTTP boundary for the existing authenticated Memgine Counter APIs. */
public final class MemgineApiClient {
    public String completePairing(String code, String businessId, String storeId, String terminalId, String name)
                throws Exception {
            JSONObject request = new JSONObject();
            request.put("pairingCode", code);
            request.put("poyntBusinessId", businessId);
            request.put("poyntStoreId", storeId);
            request.put("poyntTerminalId", terminalId);
            request.put("deviceName", name);
            return call("POST", "/api/v1/poynt/pairing/complete", null, null, request)
                    .getString("terminalCredential");
        }

    public TerminalContext context(String terminalCredential) throws Exception {
            JSONObject data = call("GET", "/api/v1/poynt/terminal/context", terminalCredential, null, null);
            JSONArray source = data.optJSONArray("staff");
            List<Staff> staff = new ArrayList<>();
            if (source != null) {
                for (int i = 0; i < source.length(); i++) {
                    JSONObject row = source.getJSONObject(i);
                    staff.add(new Staff(
                            row.getString("staffId"),
                            row.getString("displayName"),
                            row.optString("designation"),
                            row.optBoolean("pinConfigured")
                    ));
                }
            }
            return new TerminalContext(
                    data.getString("organizationId"),
                    data.getString("organizationName"),
                    data.getString("storeId"),
                    data.getString("storeName"),
                    staff
            );
        }

    public String unlock(String terminalCredential, String staffId, String pin) throws Exception {
            JSONObject request = new JSONObject();
            request.put("staffId", staffId);
            request.put("pin", pin);
            return call("POST", "/api/v1/poynt/terminal/unlock", terminalCredential, null, request)
                    .getString("sessionToken");
        }

    public Customer lookupCustomer(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                String phone,
                String region
        ) throws Exception {
            JSONObject request = new JSONObject();
            request.put("phone", phone);
            request.put("regionCode", region);
            JSONObject data = call(
                    "POST",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/customers/lookup?storeId="
                            + terminal.storeId + "&staffId=" + staffId,
                    null,
                    sessionToken,
                    request
            );
            if (data == null) {
                return null;
            }
            return new Customer(data.getString("userId"), data.getString("displayName"),
                    data.getString("primaryPhone"));
        }

    public List<Subscription> subscriptions(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                String customerUserId
        ) throws Exception {
            JSONArray values = callArray(
                    "GET",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/subscriptions?storeId="
                            + terminal.storeId + "&staffId=" + staffId + "&customerUserId=" + customerUserId,
                    null,
                    sessionToken,
                    null
            );
            List<Subscription> result = new ArrayList<>();
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.getJSONObject(i);
                result.add(new Subscription(row.getString("id"),
                        row.optString("membershipProductId"),
                        row.optString("subscriptionPlanId"),
                        row.optString("membershipProductName"),
                        row.optString("subscriptionPlanName"),
                        row.optString("statusName")));
            }
            return result;
        }

    public List<Benefit> benefits(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                String subscriptionId
        ) throws Exception {
            JSONArray values = callArray(
                    "GET",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/subscriptions/" + subscriptionId
                            + "/benefits?storeId=" + terminal.storeId + "&staffId=" + staffId,
                    null,
                    sessionToken,
                    null
            );
            List<Benefit> result = new ArrayList<>();
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.getJSONObject(i);
                result.add(new Benefit(
                        row.getString("id"),
                        row.optString("benefitName"),
                        row.optString("displayName"),
                        row.optString("description")
                ));
            }
            return result;
        }

    public String eligibility(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                String subscriptionId,
                String benefitId
        ) throws Exception {
            JSONObject request = new JSONObject();
            request.put("storeId", terminal.storeId);
            request.put("staffId", staffId);
            request.put("subscriptionId", subscriptionId);
            request.put("benefitIds", new JSONArray().put(benefitId));
            JSONArray data = callArray(
                    "POST",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/eligibility",
                    null,
                    sessionToken,
                    request
            );
            return data.length() == 0 || data.getJSONObject(0).isNull("reason")
                    ? null
                    : data.getJSONObject(0).optString("reason", null);
        }

    public List<Customer> customers(
                TerminalContext terminal,
                String staffId,
                String sessionToken
        ) throws Exception {
            JSONArray values = callArray(
                    "GET",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/customers?storeId="
                            + terminal.storeId + "&staffId=" + staffId,
                    null,
                    sessionToken,
                    null
            );
            List<Customer> result = new ArrayList<>();
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.getJSONObject(i);
                String firstName = row.optString("firstName");
                String lastName = row.optString("lastName");
                String displayName = row.optString("displayName");
                if (displayName.isEmpty()) {
                    displayName = (firstName + " " + lastName).trim();
                }
                result.add(new Customer(
                        row.getString("userId"),
                        displayName,
                        row.optString("primaryPhone"),
                        firstName,
                        lastName,
                        row.optString("primaryEmail"),
                        "CA",
                        row.optString("relationshipStatusName"),
                        row.optString("membershipName")
                ));
            }
            return result;
        }

    public List<MembershipProduct> membershipProducts(
                TerminalContext terminal,
                String sessionToken
        ) throws Exception {
            JSONArray values = callArray(
                    "GET",
                    "/api/v1/organizations/" + terminal.organizationId + "/membership-products",
                    null,
                    sessionToken,
                    null
            );
            List<MembershipProduct> result = new ArrayList<>();
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.getJSONObject(i);
                JSONArray planRows = row.optJSONArray("plans");
                List<Plan> plans = new ArrayList<>();
                if (planRows != null) {
                    for (int index = 0; index < planRows.length(); index++) {
                        JSONObject plan = planRows.getJSONObject(index);
                        plans.add(new Plan(
                                plan.getString("id"),
                                plan.optString("subscriptionPlanName"),
                                plan.optString("description"),
                                plan.optDouble("price"),
                                plan.optString("currencyCode"),
                                plan.optString("subscriptionPeriodUnit"),
                                plan.optBoolean("isDeleted")
                        ));
                    }
                }
                result.add(new MembershipProduct(
                        row.optString("id"),
                        row.optString("productStatusId"),
                        row.optString("membershipProductName"),
                        row.optString("displayName"),
                        row.optString("description"),
                        row.optBoolean("isDeleted"),
                        plans
                ));
            }
            return result;
        }

    public Set<String> activeMembershipProductStatusIds(String sessionToken) throws Exception {
        JSONObject snapshot = call("GET", "/api/v1/entity-status", null, sessionToken, null);
        Set<String> activeStatusIds = new HashSet<>();
        Set<String> activeStatusIdsForProduct = new HashSet<>();
        JSONArray statuses = snapshot.optJSONArray("statuses");
        if (statuses != null) for (int i = 0; i < statuses.length(); i++) {
            JSONObject status = statuses.getJSONObject(i);
            if ("ACTIVE".equalsIgnoreCase(status.optString("statusCode"))) activeStatusIds.add(status.optString("id"));
        }
        String entityTypeId = null;
        JSONArray entityTypes = snapshot.optJSONArray("entityTypes");
        if (entityTypes != null) for (int i = 0; i < entityTypes.length(); i++) {
            JSONObject type = entityTypes.getJSONObject(i);
            if ("MEMBERSHIP_PRODUCT".equalsIgnoreCase(type.optString("entityTypeCode")) && type.optBoolean("isActive", true)) { entityTypeId = type.optString("id"); break; }
        }
        JSONArray entityStatuses = snapshot.optJSONArray("entityStatuses");
        if (entityTypeId != null && entityStatuses != null) for (int i = 0; i < entityStatuses.length(); i++) {
            JSONObject entityStatus = entityStatuses.getJSONObject(i);
            if (entityTypeId.equals(entityStatus.optString("entityTypeId")) && entityStatus.optBoolean("isActive", true) && activeStatusIds.contains(entityStatus.optString("statusId"))) activeStatusIdsForProduct.add(entityStatus.optString("id"));
        }
        return activeStatusIdsForProduct;
    }

    public OtpChallenge requestPurchaseOtp(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                Customer customer,
                String planId
        ) throws Exception {
            JSONObject purchase = new JSONObject();
            purchase.put("storeId", terminal.storeId);
            purchase.put("staffId", staffId);
            purchase.put("planId", planId);
            if (customer.userId != null) {
                purchase.put("customerUserId", customer.userId);
            } else {
                purchase.put("firstName", customer.firstName);
                purchase.put("lastName", customer.lastName);
                purchase.put("primaryEmail", customer.email);
                purchase.put("primaryPhone", customer.primaryPhone);
            }
            JSONObject request = new JSONObject();
            request.put("regionCode", customer.regionCode);
            request.put("purchase", purchase);
            JSONObject data = call(
                    "POST",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/purchases/otp/request",
                    null,
                    sessionToken,
                    request
            );
            return new OtpChallenge(data.getString("challengeId"));
        }

    public boolean completePurchaseOtp(
                TerminalContext terminal,
                String staffId,
                String sessionToken,
                String challengeId,
                String otp
        ) throws Exception {
            JSONObject request = new JSONObject();
            request.put("challengeId", challengeId);
            request.put("otp", otp);
            call(
                    "POST",
                    "/api/v1/organizations/" + terminal.organizationId + "/counter/purchases/otp/complete",
                    null,
                    sessionToken,
                    request
            );
            return true;
        }

        private JSONObject call(
                String method,
                String path,
                String terminalCredential,
                String sessionToken,
                JSONObject request
        ) throws Exception {
            if (BuildConfig.MEMGINE_BASE_URL == null || BuildConfig.MEMGINE_BASE_URL.trim().isEmpty()) {
                throw new ApiException("Memgine server URL is not configured");
            }
            HttpURLConnection connection = (HttpURLConnection) new URL(
                    BuildConfig.MEMGINE_BASE_URL.replaceAll("/$", "") + path
            ).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/json");
            if (terminalCredential != null) {
                connection.setRequestProperty("X-Memgine-Poynt-Terminal", terminalCredential);
            }
            if (sessionToken != null) {
                connection.setRequestProperty("X-Memgine-Session", sessionToken);
            }
            if (request != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(request.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(
                    status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
                    StandardCharsets.UTF_8
            ));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            Object data = responseData(status, body.toString());
            if (data == null) {
                return null;
            }
            if (!(data instanceof JSONObject)) {
                throw new ApiException("Unexpected Memgine response");
            }
            return (JSONObject) data;
        }

        private JSONArray callArray(
                String method,
                String path,
                String terminalCredential,
                String sessionToken,
                JSONObject request
        ) throws Exception {
            if (BuildConfig.MEMGINE_BASE_URL == null || BuildConfig.MEMGINE_BASE_URL.trim().isEmpty()) {
                throw new ApiException("Memgine server URL is not configured");
            }
            HttpURLConnection connection = (HttpURLConnection) new URL(
                    BuildConfig.MEMGINE_BASE_URL.replaceAll("/$", "") + path
            ).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/json");
            if (terminalCredential != null) {
                connection.setRequestProperty("X-Memgine-Poynt-Terminal", terminalCredential);
            }
            if (sessionToken != null) {
                connection.setRequestProperty("X-Memgine-Session", sessionToken);
            }
            if (request != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(request.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(
                    status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
                    StandardCharsets.UTF_8
            ));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            Object data = responseData(status, body.toString());
            if (!(data instanceof JSONArray)) {
                throw new ApiException("Unexpected Memgine response");
            }
            return (JSONArray) data;
        }

        private Object responseData(int status, String body) throws Exception {
            JSONObject envelope = new JSONObject(body);
            if (status < 200 || status >= 300 || !envelope.optBoolean("success")) {
                JSONObject error = envelope.optJSONObject("error");
                throw new ApiException(
                        error == null
                                ? "Memgine request failed"
                                : error.optString("message", "Memgine request failed"),
                        status == HttpURLConnection.HTTP_UNAUTHORIZED
                                || status == HttpURLConnection.HTTP_FORBIDDEN
                );
            }
            if (envelope.isNull("data")) {
                return null;
            }
            return envelope.get("data");
        }
    }


