package com.mynikatech.memgine.lambda.email

interface EmailSender { fun send(to: String, subject: String, html: String) }
