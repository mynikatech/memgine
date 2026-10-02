package com.mynikatech.memgine.poynt.ui.counter;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import com.mynikatech.memgine.poynt.auth.StaffSessionStore;
import com.mynikatech.memgine.poynt.auth.TerminalCredentialStore;
import com.mynikatech.memgine.poynt.data.ApiException;
import com.mynikatech.memgine.poynt.data.MemgineApiClient;
import com.mynikatech.memgine.poynt.model.*;
import com.mynikatech.memgine.poynt.scanner.NoOpQrScanner;
import com.mynikatech.memgine.poynt.scanner.QrScanner;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;
import co.poynt.os.model.Intents;
import co.poynt.os.model.Payment;
import co.poynt.api.model.Transaction;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Coordinates classic native Counter screens; the Poynt Activity only hosts this workflow. */
public final class CounterFlowController {
    private static final long OTP_RESEND_COOLDOWN_MS = 30_000L;
    private static final int COLLECT_PAYMENT_REQUEST = 6031;
    private final MemgineApiClient api = new MemgineApiClient();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final TerminalCredentialStore terminalCredentials;
    private final StaffSessionStore staffSession;
    private LinearLayout content;
    private TextView status;
    private TerminalContext activeTerminal;
    private Staff activeStaff;
    private final QrScanner qrScanner = new NoOpQrScanner();
    private final Activity host;
    private final ViewGroup root;
    private CommerceTerminalPaymentInstruction activeTerminalPayment;
    private CommerceTerminalPaymentResult pendingTerminalPaymentResult;
    private boolean terminalPaymentStarting;
    private boolean terminalPaymentReporting;

    private enum CounterAction {
        REDEEM,
        SELL
    }

    public CounterFlowController(Activity host, ViewGroup root) {
        this.host = host;
        this.root = root;
        this.terminalCredentials = new TerminalCredentialStore(host);
        this.staffSession = new StaffSessionStore(host);
        this.content = new LinearLayout(host);
        this.content.setOrientation(LinearLayout.VERTICAL);
        this.content.setPadding(24, 20, 24, 28);
        this.status = new TextView(host);
        ScrollView scroll = new ScrollView(host);
        scroll.setFillViewport(true);
        scroll.addView(content);
        root.addView(scroll);
    }

    public void start() { refresh(); }

    public boolean navigateBack() {
        if (activeTerminalPayment != null) {
            setStatus("Complete or cancel the terminal payment before leaving this screen.");
            return true;
        }
        if (activeTerminal == null) return false;
        if (activeStaff == null) showStaffSelection(activeTerminal); else showCounterHome(activeTerminal);
        return true;
    }

    public void close() { executor.shutdownNow(); }

    private void refresh() {
        String credential = terminalCredentials.get();
        if (credential == null) {
            showPairing();
            return;
        }
        background(
                () -> api.context(credential),
                terminal -> {
                    activeTerminal = terminal;
                    String token = staffSession.token();
                    if (token == null || staffSession.staffId() == null) {
                        activeStaff = null;
                        showStaffSelection(terminal);
                        return;
                    }
                    restoreOperatorSession(terminal, token);
                },
                exception -> {
                    if (exception instanceof ApiException
                            && ((ApiException) exception).sessionExpired) {
                        clearTerminalRegistration();
                        showPairing();
                        setStatus("This terminal is no longer registered.");
                        return;
                    }
                    setStatus(apiErrorMessage(exception));
                }
        );
    }

    private void restoreOperatorSession(TerminalContext terminal, String token) {
        background(
                () -> api.validateOperatorSession(token, terminal),
                staff -> {
                    staffSession.save(token, staff.staffId);
                    activeStaff = staff;
                    showCounterHome(terminal);
                },
                exception -> {
                    if (exception instanceof ApiException
                            && ((ApiException) exception).sessionExpired) {
                        staffSession.clear();
                    }
                    activeStaff = null;
                    showStaffSelection(terminal);
                    setStatus(exception instanceof ApiException
                            ? "Counter is locked. Select an eligible operator and enter the POS PIN."
                            : "Unable to restore the Counter session. Select an operator to unlock.");
                }
        );
    }

    private void clearTerminalRegistration() {
        terminalCredentials.clear();
        staffSession.clear();
        activeTerminal = null;
        activeStaff = null;
    }

    private void showPairing() {
        render("Terminal not registered");
        text("Pair this Poynt terminal with an Organization Admin pairing code.");
        EditText code = input("Pairing code");
        EditText business = input("Poynt business ID");
        EditText store = input("Poynt store ID");
        EditText terminal = input("Poynt terminal ID");
        EditText name = input("Terminal name");
        button("Register terminal", () -> background(
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
        text("Pairing codes are single-use and expire after ten minutes. Pairing fixes this terminal to the selected organization and store.");
        cancelButton();
    }

    private void showStaffSelection(TerminalContext terminal) {
        render("Memgine Counter");
        text("Business: " + terminal.organizationName);
        text("Store: " + terminal.storeName + " · " + terminal.deviceName);
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
            pin.setText("");
            background(
                    () -> api.unlock(terminalCredentials.get(), staff.staffId, value),
                    token -> {
                        staffSession.save(token, staff.staffId);
                        activeStaff = staff;
                        showCounterHome(terminal);
                    }
            );
        });
        cancelButton();
    }

    private void showCounterHome(TerminalContext terminal) {
        render("Memgine Counter");
        LinearLayout context = CounterViews.card(host);
        context.addView(CounterViews.text(host, "Business: " + terminal.organizationName));
        context.addView(CounterViews.text(host, "Store: " + terminal.storeName));
        context.addView(CounterViews.text(host, "Staff: " + (activeStaff == null
                ? "Unlocked staff"
                : activeStaff.displayName + (activeStaff.designation.isEmpty()
                        ? "" : " · " + activeStaff.designation))));
        content.addView(context);
        button("Redeem", () -> showCustomerEntry(terminal, CounterAction.REDEEM), true);
        button("Sell Membership", () -> showCustomerEntry(terminal, CounterAction.SELL), true);
        button("Customers", () -> showCustomers(terminal), false);
        button("Lock Counter", () -> {
            staffSession.clear();
            activeStaff = null;
            showStaffSelection(terminal);
        }, false);
        cancelButton();
    }

    private void launchPoyntPayment(TerminalContext terminal, CommerceTerminalPaymentInstruction instruction) {
        activeTerminalPayment = instruction;
        pendingTerminalPaymentResult = null;
        render("Waiting for terminal");
        text("The Poynt terminal will collect the server-authoritative payment amount.");
        setStatus("Waiting for terminal");

        Payment payment = new Payment();
        payment.setAmount(instruction.amountMinor);
        payment.setCurrency(instruction.currencyCode);
        payment.setOrderId(instruction.providerOrderId);
        payment.setReferenceId(instruction.referenceId);
        payment.setMultiTender(false);
        payment.setAuthzOnly(false);

        Intent collectPayment = new Intent(Intents.ACTION_COLLECT_PAYMENT);
        collectPayment.putExtra(Intents.INTENT_EXTRAS_PAYMENT, payment);
        try {
            host.startActivityForResult(collectPayment, COLLECT_PAYMENT_REQUEST);
        } catch (ActivityNotFoundException unavailable) {
            reportTerminalPaymentResult(terminal, failedTerminalResult(
                    instruction,
                    "PAYMENT_ACTIVITY_UNAVAILABLE",
                    "Poynt payment activity is unavailable."
            ));
        }
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != COLLECT_PAYMENT_REQUEST || activeTerminalPayment == null || activeTerminal == null) {
            return;
        }
        CommerceTerminalPaymentInstruction instruction = activeTerminalPayment;
        if (resultCode == Activity.RESULT_CANCELED) {
            reportTerminalPaymentResult(activeTerminal, new CommerceTerminalPaymentResult(
                    null, "CANCELLED", instruction.amountMinor, instruction.currencyCode,
                    "PAYMENT_CANCELLED", "Payment was cancelled."
            ));
            return;
        }
        if (resultCode != Activity.RESULT_OK || data == null) {
            reportTerminalPaymentResult(activeTerminal, failedTerminalResult(
                    instruction, "PAYMENT_RESULT_UNAVAILABLE", "Terminal payment result is unavailable."
            ));
            return;
        }

        Payment payment = data.getParcelableExtra(Intents.INTENT_EXTRAS_PAYMENT);
        if (payment == null || !instruction.referenceId.equals(payment.getReferenceId())) {
            reportTerminalPaymentResult(activeTerminal, failedTerminalResult(
                    instruction, "PAYMENT_CORRELATION_FAILED", "Terminal payment could not be correlated."
            ));
            return;
        }

        String paymentStatus = payment.getStatus() == null ? "" : payment.getStatus().name();
        if ("COMPLETED".equals(paymentStatus)) {
            String providerTransactionId = completedTransactionId(payment);
            if (providerTransactionId == null) {
                reportTerminalPaymentResult(activeTerminal, failedTerminalResult(
                        instruction,
                        "PAYMENT_TRANSACTION_INVALID",
                        "Terminal payment did not return one completed transaction."
                ));
            } else {
                reportTerminalPaymentResult(activeTerminal, new CommerceTerminalPaymentResult(
                        providerTransactionId,
                        "SUCCEEDED",
                        instruction.amountMinor,
                        instruction.currencyCode,
                        null,
                        null
                ));
            }
        } else if ("CANCELED".equals(paymentStatus)) {
            reportTerminalPaymentResult(activeTerminal, new CommerceTerminalPaymentResult(
                    null, "CANCELLED", instruction.amountMinor, instruction.currencyCode,
                    "PAYMENT_CANCELLED", "Payment was cancelled."
            ));
        } else if ("FAILED".equals(paymentStatus)) {
            reportTerminalPaymentResult(activeTerminal, failedTerminalResult(
                    instruction, "PAYMENT_FAILED", "Terminal payment failed."
            ));
        } else {
            reportTerminalPaymentResult(activeTerminal, failedTerminalResult(
                    instruction, "UNSUPPORTED_PAYMENT_STATUS", "Terminal payment was not completed."
            ));
        }
    }

    /** Only a single, non-empty Poynt transaction can represent this no-split-tender phase. */
    private static String completedTransactionId(Payment payment) {
        List<Transaction> transactions = payment.getTransactions();
        if (transactions == null || transactions.size() != 1 || transactions.get(0) == null) {
            return null;
        }
        Object rawId = transactions.get(0).getId();
        if (rawId == null) return null;
        String id = rawId.toString().trim();
        return id.isEmpty() ? null : id;
    }

    private static CommerceTerminalPaymentResult failedTerminalResult(
            CommerceTerminalPaymentInstruction instruction,
            String failureCode,
            String failureMessage
    ) {
        return new CommerceTerminalPaymentResult(
                null,
                "FAILED",
                instruction.amountMinor,
                instruction.currencyCode,
                failureCode,
                failureMessage
        );
    }

    private void reportTerminalPaymentResult(
            TerminalContext terminal,
            CommerceTerminalPaymentResult result
    ) {
        if (activeTerminalPayment == null || terminalPaymentReporting) {
            return;
        }
        CommerceTerminalPaymentInstruction instruction = activeTerminalPayment;
        pendingTerminalPaymentResult = result;
        terminalPaymentReporting = true;
        render("Recording terminal payment");
        setStatus("Recording payment result");
        background(
                () -> {
                    String token = staffSession.token();
                    if (token == null) throw new ApiException("Counter session is unavailable", true);
                    api.recordTerminalPaymentResult(terminal, token, instruction, result);
                    return true;
                },
                ignored -> {
                    terminalPaymentReporting = false;
                    activeTerminalPayment = null;
                    pendingTerminalPaymentResult = null;
                    showTerminalPaymentRecorded(terminal, result);
                },
                exception -> {
                    terminalPaymentReporting = false;
                    showTerminalPaymentReportRetry(terminal, exception);
                }
        );
    }

    private void showTerminalPaymentReportRetry(TerminalContext terminal, Exception exception) {
        render("Payment result needs reporting");
        text("The terminal result has not yet been recorded by Memgine.");
        setStatus(apiErrorMessage(exception));
        button("Retry result report", () -> {
            if (pendingTerminalPaymentResult != null) {
                reportTerminalPaymentResult(terminal, pendingTerminalPaymentResult);
            }
        }, true);
    }

    private void showTerminalPaymentRecorded(TerminalContext terminal, CommerceTerminalPaymentResult result) {
        render("Terminal Payment");
        if ("SUCCEEDED".equals(result.providerStatus)) {
            text("Payment succeeded and membership was created.");
        } else if ("CANCELLED".equals(result.providerStatus)) {
            text("Payment cancelled. The Commerce transaction remains ready to retry.");
        } else {
            text("Payment failed. The Commerce transaction remains ready to retry.");
        }
        button("Back to Counter Home", () -> showCounterHome(terminal));
        cancelButton();
    }

    private void showCustomers(TerminalContext terminal) {
        render("Customers");
        text(terminal.organizationName);
        text("Search customers and view their memberships.");
        EditText query = input("Search by name, phone or email");
        button("Search", () -> {
            String value = query.getText().toString().trim();
            if (value.isEmpty()) { setStatus("Enter a customer name, phone, or email to search."); return; }
            background(() -> api.customers(terminal, staffSession.staffId(), staffSession.token()),
                    customers -> showCustomerResults(terminal, value, customers));
        }, true);
        button("Back", () -> showCounterHome(terminal));
        cancelButton();
    }

    private void showCustomerResults(TerminalContext terminal, String query, List<Customer> customers) {
        render("Customers");
        String term = query.toLowerCase(java.util.Locale.ROOT);
        String phoneTerm = normalizedPhone(query);
        int matches = 0;
        for (Customer customer : customers) {
            boolean nameOrEmail = customer.displayName.toLowerCase(java.util.Locale.ROOT).contains(term)
                    || customer.firstName.toLowerCase(java.util.Locale.ROOT).contains(term)
                    || customer.lastName.toLowerCase(java.util.Locale.ROOT).contains(term)
                    || customer.email.toLowerCase(java.util.Locale.ROOT).contains(term);
            boolean phone = !phoneTerm.isEmpty() && normalizedPhone(customer.primaryPhone).contains(phoneTerm);
            if (!nameOrEmail && !phone) continue;
            matches++;
            LinearLayout card = CounterViews.card(host);
            card.addView(CounterViews.text(host, customer.displayName));
            card.addView(CounterViews.muted(host, customer.email.isEmpty() ? customer.primaryPhone : customer.email + " · " + customer.primaryPhone));
            Button view = CounterViews.button(host, "View", false);
            view.setOnClickListener(ignored -> showCustomerDetail(terminal, customer));
            card.addView(view);
            content.addView(card);
        }
        if (matches == 0) text("No matching customers.");
        button("Back", () -> showCustomers(terminal));
        cancelButton();
    }

    private void showCustomerDetail(TerminalContext terminal, Customer customer) {
        render("Customer");
        LinearLayout card = CounterViews.card(host);
        card.addView(CounterViews.text(host, customer.displayName));
        card.addView(CounterViews.muted(host, customer.primaryPhone));
        if (!customer.email.isEmpty()) card.addView(CounterViews.muted(host, customer.email));
        if (!customer.relationshipStatusName.isEmpty()) card.addView(CounterViews.muted(host, "Status: " + customer.relationshipStatusName));
        if (!customer.membershipName.isEmpty()) card.addView(CounterViews.muted(host, "Membership: " + customer.membershipName));
        content.addView(card);
        background(() -> api.subscriptions(terminal, staffSession.staffId(), staffSession.token(), customer.userId), subscriptions -> {
            text("Memberships");
            boolean active = false;
            for (Subscription subscription : subscriptions) {
                if (!"ACTIVE".equalsIgnoreCase(subscription.statusName)) continue;
                active = true;
                text(subscription.subscriptionPlanName + "\n" + subscription.membershipProductName + " · Active");
            }
            if (!active) text("No active memberships.");
            button("Redeem Benefit", () -> showCustomer(terminal, customer, CounterAction.REDEEM), true);
            button("Sell Membership", () -> loadPlans(terminal, customer), true);
            button("Back", () -> showCustomers(terminal));
            cancelButton();
        });
    }

    private void showCustomerEntry(TerminalContext terminal, CounterAction action) {
        render(action == CounterAction.REDEEM ? "Redeem Benefit" : "Sell Membership");
        text(action == CounterAction.REDEEM
                ? "Choose how to identify the customer."
                : "Choose how to identify or add the customer.");
        if (action == CounterAction.REDEEM) {
            Button scanner = button("Scan QR", () -> qrScanner.launch(
                    () -> setStatus("QR scanning is available on supported terminals.")
            ));
            scanner.setEnabled(false);
            text("QR scanning is available on supported terminals.");
        }
        methodButton("Phone Lookup", () -> showCustomerLookup(terminal, action), true);
        methodButton("Staff-Assisted", () -> showAssistedCustomers(terminal, action), false);
        if (action == CounterAction.SELL) {
            methodButton("New Customer", () -> showNewCustomer(terminal), false);
        }
        button("Back", () -> showCounterHome(terminal));
        cancelButton();
    }

    private void showCustomerLookup(TerminalContext terminal, CounterAction action) {
        render(action == CounterAction.REDEEM ? "Redeem · Phone Lookup" : "Sell · Phone Lookup");
        text("Find an active customer by phone.");
        EditText phone = input("Customer phone");
        configurePhoneInput(phone);
        Button find = button("Find Customer", () -> {
            String token = staffSession.token();
            String staffId = staffSession.staffId();
            if (token == null || staffId == null) {
                refresh();
                return;
            }
            if (normalizedPhone(phone.getText().toString()).length() != 10) {
                setStatus("Enter a 10-digit phone number.");
                return;
            }
            background(
                    () -> api.lookupCustomer(terminal, staffId, token,
                            normalizedPhone(phone.getText().toString()), "CA"),
                    customer -> {
                        if (customer == null) {
                            setStatus("No active customer was found");
                        } else {
                            showCustomer(terminal, customer, action, () -> showCustomerLookup(terminal, action));
                        }
                    }
            );
        });
        find.setEnabled(false);
        phone.addTextChangedListener(enableWhenTenDigits(phone, find));
        button("Back", () -> showCustomerEntry(terminal, action));
        cancelButton();
    }

    private void showAssistedCustomers(TerminalContext terminal, CounterAction action) {
        render(action == CounterAction.REDEEM ? "Redeem · Staff-Assisted" : "Sell · Staff-Assisted");
        text("For customers without their phone/app. Search by phone or name — no OTP.");
        EditText query = input("Customer phone or name");
        button("Search", () -> {
            String value = query.getText().toString().trim();
            if (value.isEmpty()) {
                setStatus("Enter a phone number or name to search.");
                return;
            }
            background(
                    () -> api.customers(terminal, staffSession.staffId(), staffSession.token()),
                    customers -> showAssistedResults(terminal, action, value, customers)
            );
        }, true);
        button("Back", () -> showCustomerEntry(terminal, action));
        cancelButton();
    }

    private void showAssistedResults(
            TerminalContext terminal,
            CounterAction action,
            String query,
            List<Customer> customers
    ) {
        render(action == CounterAction.REDEEM ? "Redeem · Staff-Assisted" : "Sell · Staff-Assisted");
        String textQuery = query.toLowerCase(java.util.Locale.ROOT);
        String phoneQuery = normalizedPhone(query);
        List<Customer> matches = new ArrayList<>();
        for (Customer customer : customers) {
            boolean nameMatch = customer.displayName.toLowerCase(java.util.Locale.ROOT).contains(textQuery)
                    || customer.firstName.toLowerCase(java.util.Locale.ROOT).contains(textQuery)
                    || customer.lastName.toLowerCase(java.util.Locale.ROOT).contains(textQuery)
                    || customer.email.toLowerCase(java.util.Locale.ROOT).contains(textQuery);
            boolean phoneMatch = !phoneQuery.isEmpty()
                    && normalizedPhone(customer.primaryPhone).contains(phoneQuery);
            if (nameMatch || phoneMatch) {
                matches.add(customer);
            }
        }
        if (matches.isEmpty()) {
            text("No matching customers.");
        } else {
            for (Customer customer : matches) {
                button(customer.displayName + "\n" + customer.primaryPhone,
                        () -> showCustomer(terminal, customer, action, () -> showAssistedCustomers(terminal, action)));
            }
        }
        button("Back", () -> showAssistedCustomers(terminal, action));
        cancelButton();
    }

    private void showNewCustomer(TerminalContext terminal) {
        render("Sell · New Customer");
        text("Customer details are persisted by the existing prospective-customer flow only when the purchase OTP is requested.");
        text("Customer Information");
        text("First Name *");
        EditText firstName = input("e.g. John");
        text("Last Name *");
        EditText lastName = input("e.g. Smith");
        text("Primary Email");
        EditText email = input("e.g. john@example.com");
        text("Country *");
        Spinner country = new Spinner(host);

        List<CountryOption> countries = buildCountryOptions();

        ArrayAdapter<CountryOption> countryAdapter = new ArrayAdapter<>(
                host,
                android.R.layout.simple_spinner_item,
                countries
        );
        countryAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);

        country.setAdapter(countryAdapter);

        int canadaPosition = 0;
        for (int i = 0; i < countries.size(); i++) {
            if ("CA".equals(countries.get(i).isoCode)) {
                canadaPosition = i;
                break;
            }
        }

        country.setSelection(canadaPosition);
        content.addView(country);
        text("Phone *");
        EditText phone = input("Customer phone number");
        configurePhoneInput(phone);
        button("Choose Membership", () -> {
            if (firstName.getText().toString().trim().isEmpty()
                    || lastName.getText().toString().trim().isEmpty()
                    || !isValidInternationalPhone(phone.getText().toString())) {
                setStatus("First name, last name, and a 10-digit phone number are required.");
                return;
            }
            CountryOption selectedCountry = (CountryOption) country.getSelectedItem();
            Customer customer = new Customer(
                    null,
                    firstName.getText().toString().trim() + " " + lastName.getText().toString().trim(),
                    internationalPhoneDigits(phone.getText().toString()),
                    firstName.getText().toString().trim(),
                    lastName.getText().toString().trim(),
                    email.getText().toString().trim(),
                    selectedCountry.isoCode
            );
            loadPlans(terminal, customer);
        });
        button("Back", () -> showCustomerEntry(terminal, CounterAction.SELL));
        cancelButton();
    }

    private void loadPlans(TerminalContext terminal, Customer customer) {
        background(() -> {
            List<MembershipProduct> products = api.membershipProducts(terminal, staffSession.token());
            List<Subscription> subscriptions = customer.userId == null
                    ? new ArrayList<>()
                    : api.subscriptions(terminal, staffSession.staffId(), staffSession.token(), customer.userId);
            Set<String> activeProductStatusIds = api.activeMembershipProductStatusIds(staffSession.token());
            return new SaleCatalog(products, subscriptions, activeProductStatusIds);
        }, catalog -> showPlans(terminal, customer, catalog));
    }

    private void showPlans(
            TerminalContext terminal,
            Customer customer,
            SaleCatalog catalog
    ) {
        render("Sell · Choose Membership");
        if (!catalog.currentSubscriptions.isEmpty()) {
            LinearLayout current = CounterViews.card(host);
            current.addView(CounterViews.text(host, "Current Memberships"));
            for (Subscription subscription : catalog.currentSubscriptions) {
                current.addView(CounterViews.muted(host,
                        subscription.subscriptionPlanName + "\n" + subscription.membershipProductName + " · owned"));
            }
            content.addView(current);
        }
        text("Available Memberships");
        boolean available = false;
        for (MembershipProduct product : catalog.products) {
            if (!catalog.isAvailableForSale(product)) {
                continue;
            }
            for (Plan plan : product.plans) {
                if (plan.isDeleted) {
                    continue;
                }
                available = true;
                String title = product.displayName.isEmpty() ? product.name : product.displayName;
                String detail = plan.name + " · " + formatPrice(plan.price, plan.currencyCode);
                Button sell = button(title + "\n" + detail + (plan.periodUnit.isEmpty() ? "" : " · " + plan.periodUnit),
                        () -> showPurchaseOtp(terminal, customer, plan), true);
                if (!product.description.isEmpty() || !plan.description.isEmpty()) {
                    text(!plan.description.isEmpty() ? plan.description : product.description);
                }
            }
        }
        if (!available) {
            text("No membership plans are available.");
        }
        button("Back", () -> {
            if (customer.userId == null) {
                showNewCustomer(terminal);
            } else {
                showCustomer(terminal, customer, CounterAction.SELL);
            }
        });
        cancelButton();
    }

    private void showPurchaseOtp(TerminalContext terminal, Customer customer, Plan plan) {
        render("Sell · Verify Customer");
        text(plan.name + " · " + formatPrice(plan.price, plan.currencyCode));
        text("Request the purchase-bound OTP before payment. The membership is not created until the later payment-completion phase.");
        button("Request OTP", () -> background(
                () -> api.requestPurchaseOtp(terminal, staffSession.staffId(), staffSession.token(), customer, plan.id),
                challenge -> showPurchaseOtpCode(
                        terminal,
                        customer,
                        plan,
                        challenge,
                        System.currentTimeMillis() + OTP_RESEND_COOLDOWN_MS,
                        null
                )
        ));
        button("Back", () -> loadPlans(terminal, customer));
        cancelButton();
    }

    private void showPurchaseOtpCode(
            TerminalContext terminal,
            Customer customer,
            Plan plan,
            OtpChallenge challenge,
            long resendAvailableAt,
            String message
    ) {
        render("Sell · Enter Verification Code");
        text("Enter the six-digit code sent to the customer.");
        EditText otp = input("Verification code");
        otp.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        button("Verify OTP", () -> {
            String code = otp.getText().toString().trim();
            if (!code.matches("^[0-9]{6}$")) {
                setStatus("Enter the complete 6-digit verification code");
                return;
            }
            setStatus("");
            background(
                    () -> api.completePurchaseOtp(terminal, staffSession.staffId(), staffSession.token(),
                            challenge.challengeId, code),
                    ignored -> {
                        setStatus("");
                        showPaymentPending(terminal, customer, plan, challenge);
                    }
            );
        });
        text("Didn't receive the code?");
        final Button[] resend = new Button[1];
        resend[0] = button("Resend OTP", () -> {
            long nextResendAt = System.currentTimeMillis() + OTP_RESEND_COOLDOWN_MS;
            updateResendButton(resend[0], nextResendAt);
            background(
                    () -> api.requestPurchaseOtp(terminal, staffSession.staffId(), staffSession.token(), customer, plan.id),
                    replacement -> showPurchaseOtpCode(
                            terminal,
                            customer,
                            plan,
                            replacement,
                            System.currentTimeMillis() + OTP_RESEND_COOLDOWN_MS,
                            "A new verification code has been sent."
                    )
            );
        });
        updateResendButton(resend[0], resendAvailableAt);
        button("Back", () -> showPurchaseOtp(terminal, customer, plan));
        cancelButton();
        if (message != null) {
            setStatus(message);
        }
    }

    private void showPaymentPending(TerminalContext terminal, Customer customer, Plan plan, OtpChallenge challenge) {
        render("Membership Payment");
        text(customer.displayName);
        text(plan.name + " · " + formatPrice(plan.price, plan.currencyCode));
        text("Customer verification is complete. Choose how the purchase is paid.");
        button("Pay", () -> background(
                () -> api.startPurchasePayment(
                        terminal,
                        staffSession.token(),
                        challenge.challengeId,
                        challenge.challengeId + ":poynt"
                ),
                intent -> {
                    if ("TEST".equalsIgnoreCase(intent.providerCode)) {
                        background(
                                () -> api.confirmTestPayment(terminal, staffSession.token(), intent.id),
                                ignored -> showProviderPaymentSuccess(terminal, customer, plan),
                                exception -> setStatus(apiErrorMessage(exception))
                        );
                        return;
                    }
                    if (!"POYNT".equalsIgnoreCase(intent.providerCode)) {
                        setStatus("The configured payment provider is unavailable.");
                        return;
                    }
                    startMembershipTerminalPayment(terminal, intent);
                }
        ));
        button("Pay By Cash and Subscribe", () -> background(
                () -> api.startCashPayment(
                        terminal,
                        staffSession.token(),
                        challenge.challengeId,
                        challenge.challengeId + ":cash"
                ),
                intent -> showCashConfirmation(terminal, customer, plan, challenge, intent)
        ));
        button("Back", () -> showPurchaseOtpCode(
                terminal,
                customer,
                plan,
                challenge,
                System.currentTimeMillis() + OTP_RESEND_COOLDOWN_MS,
                null
        ));
        cancelButton();
    }

    private void startMembershipTerminalPayment(TerminalContext terminal, PaymentIntent intent) {
        String commerceTransactionId = intent.commerceTransactionId == null
                ? ""
                : intent.commerceTransactionId.trim();
        if (commerceTransactionId.isEmpty()) {
            setStatus("Terminal payment is missing its Commerce transaction.");
            return;
        }
        if (terminalPaymentStarting || activeTerminalPayment != null) {
            setStatus("A terminal payment is already in progress.");
            return;
        }
        String token = staffSession.token();
        if (token == null) {
            refresh();
            return;
        }
        terminalPaymentStarting = true;
        setStatus("Starting payment");
        background(
                () -> api.startTerminalPayment(terminal, token, commerceTransactionId),
                instruction -> {
                    terminalPaymentStarting = false;
                    if (!"POYNT".equalsIgnoreCase(instruction.providerCode)) {
                        setStatus("The configured payment provider is unavailable.");
                        return;
                    }
                    if (instruction.amountMinor <= 0) {
                        setStatus("Terminal payment amount is unavailable.");
                        return;
                    }
                    launchPoyntPayment(terminal, instruction);
                },
                exception -> {
                    terminalPaymentStarting = false;
                    setStatus(apiErrorMessage(exception));
                }
        );
    }

    private void showCashConfirmation(
            TerminalContext terminal,
            Customer customer,
            Plan plan,
            OtpChallenge challenge,
            PaymentIntent intent
    ) {
        render("Confirm Cash Received");
        text(customer.displayName);
        text("Confirm " + formatPrice(intent.amount, intent.currencyCode) + " cash received.");
        button("Confirm Cash Received", () -> background(
                () -> api.confirmCashPayment(terminal, staffSession.token(), intent.id),
                ignored -> showCashSuccess(terminal, customer, plan)
        ));
        button("Back", () -> showPaymentPending(terminal, customer, plan, challenge));
        cancelButton();
    }

    private void showCashSuccess(TerminalContext terminal, Customer customer, Plan plan) {
        render("Membership Sold");
        text(customer.displayName);
        text(plan.name + " · " + formatPrice(plan.price, plan.currencyCode));
        text("Cash payment confirmed and membership created.");
        button("Back to Counter Home", () -> showCounterHome(terminal));
        cancelButton();
    }

    private void showProviderPaymentSuccess(TerminalContext terminal, Customer customer, Plan plan) {
        render("Membership Sold");
        text(customer.displayName);
        text(plan.name + " · " + formatPrice(plan.price, plan.currencyCode));
        text("Payment succeeded and membership was created.");
        button("Back to Counter Home", () -> showCounterHome(terminal));
        cancelButton();
    }

    private void showCustomer(TerminalContext terminal, Customer customer, CounterAction action) {
        showCustomer(terminal, customer, action, () -> showCustomerEntry(terminal, action));
    }

    private void showCustomer(TerminalContext terminal, Customer customer, CounterAction action, Runnable back) {
        render(action == CounterAction.REDEEM ? "Redeem · Customer" : "Sell · Customer");
        text(customer.displayName);
        text(customer.primaryPhone);
        if (action == CounterAction.REDEEM) {
            button("View Memberships", () -> background(
                    () -> api.subscriptions(terminal, staffSession.staffId(), staffSession.token(), customer.userId),
                    subscriptions -> showSubscriptions(terminal, customer, subscriptions)
            ));
        } else {
            button("Choose Membership", () -> loadPlans(terminal, customer));
        }
        button("Back", back);
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
                        () -> loadRedemptionSelection(terminal, customer, subscriptions, subscription));
            }
        }
        if (!active) {
            text("No active memberships.");
        }
        button("Back", () -> showCustomer(terminal, customer, CounterAction.REDEEM));
        cancelButton();
    }

    private void loadRedemptionSelection(
            TerminalContext terminal,
            Customer customer,
            List<Subscription> subscriptions,
            Subscription subscription
    ) {
        background(
                () -> api.redemptionSelection(terminal, staffSession.staffId(), staffSession.token(),
                        subscription.id, customer.userId),
                selection -> showRedemptionSelection(terminal, customer, subscriptions, subscription,
                        selection, new java.util.HashSet<>(), new java.util.HashSet<>())
        );
    }

    private void showRedemptionSelection(
            TerminalContext terminal,
            Customer customer,
            List<Subscription> subscriptions,
            Subscription subscription,
            RedemptionSelection selection,
            Set<String> selectedBenefits,
            Set<String> selectedOffers
    ) {
        render("Redeem · " + subscription.membershipProductName);
        text("Benefits");
        for (RedemptionSelection.Item benefit : selection.benefits) {
            boolean selected = selectedBenefits.contains(benefit.id);
            String label = (selected ? "[x] " : "[ ] ") + benefit.displayName
                    + (benefit.available() ? "" : " · " + safeReason(benefit));
            if (benefit.available()) {
                button(label, () -> {
                        Set<String> next = new java.util.HashSet<>(selectedBenefits);
                        if (!next.add(benefit.id)) next.remove(benefit.id);
                        showRedemptionSelection(terminal, customer, subscriptions, subscription, selection, next, selectedOffers);
                });
            } else {
                text(label);
            }
            if (!benefit.description.isEmpty()) text(benefit.description);
        }
        if (!selection.offers.isEmpty()) text("Offers");
        for (RedemptionSelection.Item offer : selection.offers) {
            boolean selected = selectedOffers.contains(offer.id);
            String label = (selected ? "[x] " : "[ ] ") + offer.displayName
                    + (offer.available() ? "" : " · " + safeReason(offer));
            if (offer.available()) {
                button(label, () -> {
                        Set<String> next = new java.util.HashSet<>(selectedOffers);
                        if (!next.add(offer.id)) next.remove(offer.id);
                        showRedemptionSelection(terminal, customer, subscriptions, subscription, selection, selectedBenefits, next);
                });
            } else {
                text(label);
            }
            if (offer.badgeText != null && !offer.badgeText.isEmpty()) text(offer.badgeText);
            if (!offer.description.isEmpty()) text(offer.description);
        }
        int total = selectedBenefits.size() + selectedOffers.size();
        text(total == 0 ? "No items selected" : selectedBenefits.size() + " Benefit" + (selectedBenefits.size() == 1 ? "" : "s")
                + (selectedBenefits.isEmpty() || selectedOffers.isEmpty() ? "" : " + ")
                + (selectedOffers.isEmpty() ? "" : selectedOffers.size() + " Offer" + (selectedOffers.size() == 1 ? "" : "s")) + " selected");
        if (total > 0) button("Redeem Selected", () -> background(() -> {
            String transactionId = api.createRedemptionTransaction(terminal, staffSession.staffId(), staffSession.token(),
                    subscription.id, selectedBenefits, selectedOffers);
            List<RedemptionSelection.Item> validation = api.validateRedemptionTransaction(terminal,
                    staffSession.staffId(), staffSession.token(), transactionId);
            for (RedemptionSelection.Item item : validation) {
                if (!item.available()) throw new ApiException(item.displayReason == null ? "A selected item is no longer available." : item.displayReason);
            }
            api.executeRedemptionTransaction(terminal, staffSession.staffId(), staffSession.token(), transactionId);
            return transactionId;
        }, transactionId -> showRedemptionSuccess(terminal, customer, transactionId)));
        button("Back", () -> {
            showSubscriptions(terminal, customer, subscriptions);
        });
        cancelButton();
    }

    private static String safeReason(RedemptionSelection.Item item) {
        return item.displayReason == null || item.displayReason.isEmpty() ? "Unavailable" : item.displayReason;
    }

    private void showRedemptionSuccess(TerminalContext terminal, Customer customer, String transactionId) {
        render("Redemption successful");
        text(customer.displayName);
        text("Transaction: " + transactionId);
        text("All selected benefits and offers were redeemed together.");
        button("Back to Counter Home", () -> showCounterHome(terminal));
        cancelButton();
    }

    private static String normalizedPhone(String value) {
        String digits = value.replaceAll("\\D", "");
        return digits.length() <= 10 ? digits : digits.substring(digits.length() - 10);
    }
    private static String internationalPhoneDigits(String value) {
    return value == null ? "" : value.replaceAll("\\D", "");
        }

        private static boolean isValidInternationalPhone(String value) {
            int length = internationalPhoneDigits(value).length();
            return length >= 7 && length <= 15;
        }

        private static List<CountryOption> buildCountryOptions() {
            List<CountryOption> countries = new ArrayList<>();

            for (String isoCode : Locale.getISOCountries()) {
                Locale locale = new Locale("", isoCode);
                String name = locale.getDisplayCountry();

                if (!name.isEmpty()) {
                    countries.add(new CountryOption(isoCode, name));
                }
            }

            Collections.sort(
                    countries,
                    Comparator.comparing(
                            country -> country.displayName,
                            String.CASE_INSENSITIVE_ORDER
                    )
            );

            return countries;
        }

        private static final class CountryOption {
            final String isoCode;
            final String displayName;

            CountryOption(String isoCode, String displayName) {
                this.isoCode = isoCode;
                this.displayName = displayName;
            }

            @Override
            public String toString() {
                return displayName;
            }
        }

    private void configurePhoneInput(EditText input) {
        input.setInputType(InputType.TYPE_CLASS_PHONE);
        input.addTextChangedListener(new TextWatcher() {
            private boolean changing;
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { }
            @Override public void afterTextChanged(Editable value) {
                if (changing) return;
                String normalized = normalizedPhone(value.toString());
                if (!normalized.equals(value.toString())) {
                    changing = true;
                    value.replace(0, value.length(), normalized);
                    changing = false;
                }
            }
        });
    }

    private TextWatcher enableWhenTenDigits(EditText input, Button button) {
        return new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
                button.setEnabled(normalizedPhone(value.toString()).length() == 10);
            }
            @Override public void afterTextChanged(Editable value) { }
        };
    }

    private void updateResendButton(Button resend, long resendAvailableAt) {
        if (resend.getParent() == null) {
            return;
        }
        long remainingMillis = resendAvailableAt - System.currentTimeMillis();
        if (remainingMillis <= 0) {
            resend.setEnabled(true);
            resend.setText("Resend OTP");
            return;
        }
        long remainingSeconds = (remainingMillis + 999L) / 1_000L;
        resend.setEnabled(false);
        resend.setText("Resend OTP (" + remainingSeconds + "s)");
        mainHandler.postDelayed(
                () -> updateResendButton(resend, resendAvailableAt),
                Math.min(1_000L, remainingMillis)
        );
    }

    private void render(String title) {
        content.removeAllViews();
        TextView heading = CounterViews.title(host, title);
        content.addView(heading);
        content.addView(status);
        setStatus("");
    }

    private TextView text(String value) {
        TextView view = CounterViews.text(host, value);
        content.addView(view);
        return view;
    }

    private EditText input(String hint) {
        EditText view = CounterViews.input(host, hint);
        content.addView(view);
        return view;
    }

    private Button button(String label, Runnable action) {
        return button(label, action, false);
    }

    private Button methodButton(String label, Runnable action, boolean selected) {
        Button view = CounterViews.button(host, label, false, selected);
        view.setOnClickListener(ignored -> action.run());
        content.addView(view);
        return view;
    }

    private Button button(String label, Runnable action, boolean primary) {
        Button view = CounterViews.button(host, label, primary);
        view.setOnClickListener(ignored -> action.run());
        content.addView(view);
        return view;
    }

    private void cancelButton() {
        button("Cancel", this::finishWithPoyntResult);
    }

    private <T> void background(Callable<T> request, Success<T> success) {
        background(request, success, exception -> {
            if (exception instanceof ApiException
                    && ((ApiException) exception).sessionExpired
                    && activeTerminal != null) {
                staffSession.clear();
                activeStaff = null;
                showStaffSelection(activeTerminal);
                return;
            }
            setStatus(apiErrorMessage(exception));
        });
    }

    private <T> void background(Callable<T> request, Success<T> success, Failure failure) {
        setStatus("Working…");
        executor.execute(() -> {
            try {
                T value = request.call();
                host.runOnUiThread(() -> {
                    setStatus("");
                    success.accept(value);
                });
            } catch (Exception exception) {
                host.runOnUiThread(() -> {
                    failure.accept(exception);
                });
            }
        });
    }

    private String apiErrorMessage(Exception exception) {
        return exception instanceof ApiException
                ? exception.getMessage()
                : "Memgine request failed";
    }

    private void setStatus(String value) {
        status.setText(value);
        status.setVisibility(value.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void finishWithPoyntResult() {
        host.setResult(Activity.RESULT_CANCELED, new Intent(Intents.ACTION_PROCESS_LOYALTY_RESULT));
        host.finish();
    }

    private static String formatPrice(double price, String currencyCode) {
        return String.format(
                java.util.Locale.US,
                "%s %.2f",
                currencyCode == null || currencyCode.isEmpty() ? "" : currencyCode,
                price
        ).trim();
    }

    private interface Success<T> {
        void accept(T value);
    }

    private interface Failure {
        void accept(Exception exception);
    }


}
