package com.mynikatech.memgine.poynt.loyalty;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import co.poynt.os.model.Intents;

/**
 * Skeleton only. Poynt completion and cancellation are observed here; no
 * Memgine redemption is finalized until a dedicated payment binding exists.
 */
public final class TransactionReceiver extends BroadcastReceiver {
    private static final String TAG = "MemginePoynt";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }
        String transactionId = intent.getStringExtra(Intents.INTENT_EXTRAS_TRANSACTION_ID);
        if (transactionId == null || transactionId.length() > 128) {
            return;
        }
        if (Intents.ACTION_TRANSACTION_COMPLETED.equals(intent.getAction())) {
            Log.i(TAG, "Poynt transaction-completed event received");
        } else if (Intents.ACTION_PAYMENT_CANCELED.equals(intent.getAction())) {
            Log.i(TAG, "Poynt payment-canceled event received");
        }
    }
}
