package com.mynikatech.memgine.poynt.loyalty;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;

import com.mynikatech.memgine.poynt.R;
import com.mynikatech.memgine.poynt.ui.counter.CounterFlowFragment;

import co.poynt.os.model.Intents;

/** Thin Poynt host. Counter UI, state, and HTTP work live outside the Activity. */
public final class MemgineLoyaltyActivity extends Activity {
    private final TransactionReceiver transactionReceiver = new TransactionReceiver();

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_memgine_loyalty);
        if (state == null) {
            getFragmentManager().beginTransaction().replace(R.id.loyalty_fragment_host,
                    new CounterFlowFragment()).commit();
        }
    }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intents.ACTION_TRANSACTION_COMPLETED);
        filter.addAction(Intents.ACTION_PAYMENT_CANCELED);
        registerReceiver(transactionReceiver, filter);
    }

    @Override protected void onStop() {
        unregisterReceiver(transactionReceiver);
        super.onStop();
    }

    @Override public void onBackPressed() {
        CounterFlowFragment flow = (CounterFlowFragment) getFragmentManager()
                .findFragmentById(R.id.loyalty_fragment_host);
        if (flow != null && flow.navigateBack()) return;
        super.onBackPressed();
    }

    public void cancelLoyalty() {
        setResult(RESULT_CANCELED, new Intent(Intents.ACTION_PROCESS_LOYALTY_RESULT));
        finish();
    }
}
