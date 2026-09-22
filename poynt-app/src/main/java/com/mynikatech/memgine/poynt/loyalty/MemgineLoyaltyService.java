package com.mynikatech.memgine.poynt.loyalty;

import android.app.Service;
import android.content.ComponentName;
import android.content.Intent;
import android.os.IBinder;
import android.os.RemoteException;

import co.poynt.os.model.Intents;
import co.poynt.os.model.Payment;
import co.poynt.os.services.v1.IPoyntLoyaltyService;
import co.poynt.os.services.v1.IPoyntLoyaltyServiceListener;

/**
 * Poynt's loyalty-service entry point. Business operations remain in Memgine;
 * this service only launches the native terminal workflow.
 */
public final class MemgineLoyaltyService extends Service {

    private final IPoyntLoyaltyService.Stub binder = new LoyaltyBinder();

    private final class LoyaltyBinder extends IPoyntLoyaltyService.Stub {

        @Override
        public void process(
                Payment payment,
                String requestId,
                IPoyntLoyaltyServiceListener listener
        ) throws RemoteException {

            if (payment == null || payment.getOrder() == null || requestId == null
                    || requestId.trim().isEmpty() || listener == null) {

                if (listener != null) {
                    listener.noLoyaltyApplied(requestId);
                }

                return;
            }

            Intent intent = new Intent(Intents.ACTION_PROCESS_LOYALTY);

            intent.setComponent(new ComponentName(
                    getPackageName(),
                    MemgineLoyaltyActivity.class.getName()
            ));

            intent.putExtra("payment", payment);

            listener.onLaunchActivity(intent, requestId);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
}