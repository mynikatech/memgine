package com.mynikatech.memgine.poynt.scanner;

/**
 * Terminal-specific scanning will be supplied in a later phase once the
 * customer's Poynt hardware model is confirmed.
 */
public interface QrScanner {
    void launch(Callback callback);

    interface Callback {
        void unavailable();
    }
}
