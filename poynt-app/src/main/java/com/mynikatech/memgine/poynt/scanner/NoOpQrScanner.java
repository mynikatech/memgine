package com.mynikatech.memgine.poynt.scanner;

public final class NoOpQrScanner implements QrScanner {
    @Override
    public void launch(Callback callback) {
        callback.unavailable();
    }
}
