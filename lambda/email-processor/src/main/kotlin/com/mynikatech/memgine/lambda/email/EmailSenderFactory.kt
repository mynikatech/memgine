package com.mynikatech.memgine.lambda.email

object EmailSenderFactory { fun create(): EmailSender = ResendEmailSender() }
