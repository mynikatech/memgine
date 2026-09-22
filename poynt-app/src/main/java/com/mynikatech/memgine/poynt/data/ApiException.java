package com.mynikatech.memgine.poynt.data;
public final class ApiException extends Exception { public final boolean sessionExpired; public ApiException(String message){this(message,false);} public ApiException(String message,boolean sessionExpired){super(message);this.sessionExpired=sessionExpired;} }
