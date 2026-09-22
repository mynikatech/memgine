package com.mynikatech.memgine.poynt.loyalty;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.mynikatech.memgine.poynt.BuildConfig;
import com.mynikatech.memgine.poynt.scanner.NoOpQrScanner;
import com.mynikatech.memgine.poynt.scanner.QrScanner;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import co.poynt.os.model.Intents;

/**
 * A deliberately small Poynt workflow: pair a terminal, unlock through the
 * existing server-side POS PIN flow, and inspect a selected customer's
 * membership eligibility. It never receives card data or finalizes redemption.
 */
public final class MemgineLoyaltyActivity extends Activity {
    private final MemgineApi api = new MemgineApi();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TerminalCredentials terminalCredentials;
    private StaffSession staffSession;
    private LinearLayout content;
    private TextView status;
    private final TransactionReceiver transactionReceiver = new TransactionReceiver();
    private final QrScanner qrScanner = new NoOpQrScanner();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        terminalCredentials = new TerminalCredentials(this);
        staffSession = new StaffSession(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(32, 32, 32, 32);
        status = new TextView(this);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
        refresh();
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intents.ACTION_TRANSACTION_COMPLETED);
        filter.addAction(Intents.ACTION_PAYMENT_CANCELED);
        registerReceiver(transactionReceiver, filter);
    }

    @Override
    protected void onStop() {
        unregisterReceiver(transactionReceiver);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void refresh() {
        String credential = terminalCredentials.get();
        if (credential == null) {
            showPairing();
            return;
        }
        background(() -> api.context(credential), terminal -> {
            if (staffSession.token() == null || staffSession.staffId() == null) {
                showStaffSelection(terminal);
            } else {
                showCustomerLookup(terminal);
            }
        });
    }

    private void showPairing() {
        render("Pair this Poynt terminal");
        EditText code = input("Pairing code");
        EditText business = input("Poynt business ID");
        EditText store = input("Poynt store ID");
        EditText terminal = input("Poynt terminal ID");
        EditText name = input("Terminal name");
        button("Pair terminal", () -> background(
                () -> api.completePairing(
                        code.getText().toString(),
                        business.getText().toString(),
                        store.getText().toString(),
                        terminal.getText().toString(),
                        name.getText().toString()),
                credential -> {
                    terminalCredentials.save(credential);
                    staffSession.clear();
                    refresh();
                }
        ));
        text("Pairing codes are single-use and expire after ten minutes.");
        cancelButton();
    }

    private void showStaffSelection(TerminalContext terminal) {
        render("Memgine · " + terminal.storeName);
        text("Select staff and enter the four-digit Memgine POS PIN.");
        for (Staff staff : terminal.staff) {
            Button select = button(
                    staff.displayName + (staff.pinConfigured ? "" : " · PIN unavailable"),
                    () -> {
                        if (staff.pinConfigured) {
                            showPin(terminal, staff);
                        }
                    }
            );
            select.setEnabled(staff.pinConfigured);
        }
        cancelButton();
    }

    private void showPin(TerminalContext terminal, Staff staff) {
        render("Unlock Counter");
        text(staff.displayName);
        EditText pin = input("4-digit PIN");
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        button("Unlock", () -> {
            String value = pin.getText().toString();
            if (!value.matches("^[0-9]{4}$")) {
                setStatus("PIN must be exactly 4 digits");
                return;
            }
            background(
                    () -> api.unlock(terminalCredentials.get(), staff.staffId, value),
                    token -> {
                        staffSession.save(token, staff.staffId);
                        showCustomerLookup(terminal);
                    }
            );
        });
        cancelButton();
    }

    private void showCustomerLookup(TerminalContext terminal) {
        render("Memgine · " + terminal.storeName);
        text("Counter is unlocked. Find an existing customer by phone.");
        EditText phone = input("Customer phone");
        EditText region = input("Region");
        region.setText("CA");
        button("Find customer", () -> {
            String token = staffSession.token();
            String staffId = staffSession.staffId();
            if (token == null || staffId == null) {
                refresh();
                return;
            }
            background(
                    () -> api.lookupCustomer(terminal, staffId, token,
                            phone.getText().toString(), region.getText().toString()),
                    customer -> {
                        if (customer == null) {
                            setStatus("No active customer was found");
                        } else {
                            showCustomer(terminal, customer);
                        }
                    }
            );
        });
        Button scanner = button("Scan Memgine QR (not available)",
                () -> qrScanner.launch(
                        () -> setStatus("QR scanner integration is not configured for this terminal")
                ));
        scanner.setEnabled(false);
        button("Lock Counter", () -> {
            staffSession.clear();
            showStaffSelection(terminal);
        });
        continueButton();
        cancelButton();
    }

    private void showCustomer(TerminalContext terminal, Customer customer) {
        render("Customer");
        text(customer.displayName);
        text(customer.primaryPhone);
        button("Load memberships", () -> background(
                () -> api.subscriptions(terminal, staffSession.staffId(), staffSession.token(), customer.userId),
                subscriptions -> showSubscriptions(terminal, customer, subscriptions)
        ));
        button("Back", () -> showCustomerLookup(terminal));
        continueButton();
        cancelButton();
    }

    private void showSubscriptions(
            TerminalContext terminal,
            Customer customer,
            List<Subscription> subscriptions
    ) {
        render("Memberships · " + customer.displayName);
        boolean active = false;
        for (Subscription subscription : subscriptions) {
            if ("active".equalsIgnoreCase(subscription.statusName)) {
                active = true;
                button(subscription.membershipProductName + " · " + subscription.subscriptionPlanName,
                        () -> loadBenefits(terminal, subscription));
            }
        }
        if (!active) {
            text("No active memberships.");
        }
        button("Back", () -> showCustomer(terminal, customer));
        continueButton();
        cancelButton();
    }

    private void loadBenefits(TerminalContext terminal, Subscription subscription) {
        background(
                () -> api.benefits(terminal, staffSession.staffId(), staffSession.token(), subscription.id),
                benefits -> showBenefits(terminal, subscription, benefits)
        );
    }

    private void showBenefits(
            TerminalContext terminal,
            Subscription subscription,
            List<Benefit> benefits
    ) {
        render("Benefits · " + subscription.membershipProductName);
        if (benefits.isEmpty()) {
            text("No benefits are available.");
        }
        for (Benefit benefit : benefits) {
            button(benefit.name + " (" + benefit.benefitCode + ")",
                    () -> checkEligibility(terminal, subscription, benefit));
        }
        text("Redemption and purchase finalization require Poynt payment completion and are not enabled.");
        button("Back", () -> loadBenefits(terminal, subscription));
        continueButton();
        cancelButton();
    }

    private void checkEligibility(TerminalContext terminal, Subscription subscription, Benefit benefit) {
        background(
                () -> api.eligibility(terminal, staffSession.staffId(), staffSession.token(),
                        subscription.id, benefit.id),
                rejection -> setStatus(rejection == null ? "Benefit is eligible" : rejection)
        );
    }

    private void render(String title) {
        content.removeAllViews();
        TextView heading = text(title);
        heading.setTextSize(22f);
        content.addView(status);
        setStatus("");
    }

    private TextView text(String value) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setPadding(0, 12, 0, 12);
        content.addView(view);
        return view;
    }

    private EditText input(String hint) {
        EditText view = new EditText(this);
        view.setHint(hint);
        content.addView(view);
        return view;
    }

    private Button button(String label, Runnable action) {
        Button view = new Button(this);
        view.setText(label);
        view.setOnClickListener(ignored -> action.run());
        content.addView(view);
        return view;
    }

    private void cancelButton() {
        button("Cancel", this::finishWithPoyntResult);
    }

    private void continueButton() {
        button("Continue", this::finishWithPoyntResult);
    }

    private <T> void background(Callable<T> request, Success<T> success) {
        setStatus("Working…");
        executor.execute(() -> {
            try {
                T value = request.call();
                runOnUiThread(() -> {
                    setStatus("");
                    success.accept(value);
                });
            } catch (Exception exception) {
                runOnUiThread(() -> setStatus(
                        exception instanceof ApiException ? exception.getMessage() : "Memgine request failed"
                ));
            }
        });
    }

    private void setStatus(String value) {
        status.setText(value);
        status.setVisibility(value.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void finishWithPoyntResult() {
        setResult(RESULT_CANCELED, new Intent(Intents.ACTION_PROCESS_LOYALTY_RESULT));
        finish();
    }

    private interface Success<T> {
        void accept(T value);
    }

    private static final class TerminalCredentials {
        private static final String CREDENTIAL = "terminal_credential";
        private final SharedPreferences preferences;

        TerminalCredentials(Context context) {
            preferences = encryptedPreferences(context, "memgine_terminal");
        }

        String get() {
            return preferences.getString(CREDENTIAL, null);
        }

        void save(String value) {
            preferences.edit().putString(CREDENTIAL, value).apply();
        }
    }

    private static final class StaffSession {
        private static final String TOKEN = "session_token";
        private static final String STAFF_ID = "staff_id";
        private final SharedPreferences preferences;

        StaffSession(Context context) {
            preferences = encryptedPreferences(context, "memgine_staff_session");
        }

        String token() {
            return preferences.getString(TOKEN, null);
        }

        String staffId() {
            return preferences.getString(STAFF_ID, null);
        }

        void save(String token, String staffId) {
            preferences.edit().putString(TOKEN, token).putString(STAFF_ID, staffId).apply();
        }

        void clear() {
            preferences.edit().clear().apply();
        }
    }

    private static SharedPreferences encryptedPreferences(Context context, String name) {
        try {
            MasterKey key = new MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            return EncryptedSharedPreferences.create(
                    context,
                    name,
                    key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to secure terminal credentials", exception);
        }
    }

    private static final class MemgineApi {
        String completePairing(String code, String businessId, String storeId, String terminalId, String name)
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

        TerminalContext context(String terminalCredential) throws Exception {
            JSONObject data = call("GET", "/api/v1/poynt/terminal/context", terminalCredential, null, null);
            JSONArray source = data.optJSONArray("staff");
            List<Staff> staff = new ArrayList<>();
            if (source != null) {
                for (int i = 0; i < source.length(); i++) {
                    JSONObject row = source.getJSONObject(i);
                    staff.add(new Staff(
                            row.getString("staffId"),
                            row.getString("displayName"),
                            row.optBoolean("pinConfigured")
                    ));
                }
            }
            return new TerminalContext(
                    data.getString("organizationId"),
                    data.getString("storeId"),
                    data.getString("storeName"),
                    staff
            );
        }

        String unlock(String terminalCredential, String staffId, String pin) throws Exception {
            JSONObject request = new JSONObject();
            request.put("staffId", staffId);
            request.put("pin", pin);
            return call("POST", "/api/v1/poynt/terminal/unlock", terminalCredential, null, request)
                    .getString("sessionToken");
        }

        Customer lookupCustomer(
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

        List<Subscription> subscriptions(
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
                        row.optString("membershipProductName"),
                        row.optString("subscriptionPlanName"),
                        row.optString("statusName")));
            }
            return result;
        }

        List<Benefit> benefits(
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
                result.add(new Benefit(row.getString("id"), row.optString("name"),
                        row.optString("benefitCode")));
            }
            return result;
        }

        String eligibility(
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
                throw new ApiException(error == null
                        ? "Memgine request failed"
                        : error.optString("message", "Memgine request failed"));
            }
            if (envelope.isNull("data")) {
                return null;
            }
            return envelope.get("data");
        }
    }

    private static final class TerminalContext {
        final String organizationId;
        final String storeId;
        final String storeName;
        final List<Staff> staff;
        TerminalContext(String organizationId, String storeId, String storeName, List<Staff> staff) {
            this.organizationId = organizationId;
            this.storeId = storeId;
            this.storeName = storeName;
            this.staff = staff;
        }
    }

    private static final class Staff {
        final String staffId;
        final String displayName;
        final boolean pinConfigured;
        Staff(String staffId, String displayName, boolean pinConfigured) {
            this.staffId = staffId;
            this.displayName = displayName;
            this.pinConfigured = pinConfigured;
        }
    }

    private static final class Customer {
        final String userId;
        final String displayName;
        final String primaryPhone;
        Customer(String userId, String displayName, String primaryPhone) {
            this.userId = userId;
            this.displayName = displayName;
            this.primaryPhone = primaryPhone;
        }
    }

    private static final class Subscription {
        final String id;
        final String membershipProductName;
        final String subscriptionPlanName;
        final String statusName;
        Subscription(String id, String membershipProductName, String subscriptionPlanName, String statusName) {
            this.id = id;
            this.membershipProductName = membershipProductName;
            this.subscriptionPlanName = subscriptionPlanName;
            this.statusName = statusName;
        }
    }

    private static final class Benefit {
        final String id;
        final String name;
        final String benefitCode;
        Benefit(String id, String name, String benefitCode) {
            this.id = id;
            this.name = name;
            this.benefitCode = benefitCode;
        }
    }

    private static final class ApiException extends Exception {
        ApiException(String message) {
            super(message);
        }
    }
}
