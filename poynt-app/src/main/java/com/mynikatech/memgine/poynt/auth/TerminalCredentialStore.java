package com.mynikatech.memgine.poynt.auth;
import android.content.Context;

/** Encrypted, persistent terminal registration; it is separate from an operator session. */
public final class TerminalCredentialStore extends EncryptedPreferenceStore {
    private static final String CREDENTIAL = "terminal_credential";

    public TerminalCredentialStore(Context context) {
        super(context, "memgine_terminal");
    }

    public String get() {
        return preferences.getString(CREDENTIAL, null);
    }

    public void save(String value) {
        preferences.edit().putString(CREDENTIAL, value).apply();
    }

    public void clear() {
        preferences.edit().remove(CREDENTIAL).apply();
    }
}
