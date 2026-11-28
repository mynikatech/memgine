package com.mynikatech.memgine.component.notification

/** Renders named placeholders once; event values are never interpreted as templates. */
object NotificationTemplateRenderer {
    private val placeholder = Regex("\\{([A-Za-z][A-Za-z0-9_]{0,63})}")
    private val validName = Regex("[A-Za-z][A-Za-z0-9_]{0,63}")
    private val secretName = Regex("otp|password|secret|credential|token|pickup.?code", RegexOption.IGNORE_CASE)

    fun render(template: NotificationContentTemplate, parameters: Map<String, String>): RenderedNotificationContent {
        require(template.allowedParameters.all { validName.matches(it) && !secretName.containsMatchIn(it) }) {
            "Invalid notification parameter definition"
        }
        require(parameters.keys.all { it in template.allowedParameters } &&
            template.providerParameterOrder.all { it in template.allowedParameters }) {
            "Unexpected notification parameter"
        }
        fun value(name: String): String = requireNotNull(parameters[name]?.takeIf { it.isNotBlank() && it.length <= 1000 }) {
            "Missing notification parameter"
        }
        fun text(pattern: String): String {
            val matches = placeholder.findAll(pattern).toList()
            var cursor = 0
            val result = StringBuilder()
            for (match in matches) {
                val literal = pattern.substring(cursor, match.range.first)
                require('{' !in literal && '}' !in literal) { "Invalid notification template" }
                val name = match.groupValues[1]
                require(name in template.allowedParameters) { "Unexpected notification placeholder" }
                result.append(literal).append(value(name))
                cursor = match.range.last + 1
            }
            val remaining = pattern.substring(cursor)
            require('{' !in remaining && '}' !in remaining) { "Invalid notification template" }
            return result.append(remaining).toString()
        }
        val title = text(template.title)
        val message = text(template.message)
        require(title.isNotBlank() && title.length <= 200 && message.isNotBlank() && message.length <= 4000) {
            "Invalid notification content"
        }
        return RenderedNotificationContent(title, message, template.providerParameterOrder.map(::value))
    }
}
